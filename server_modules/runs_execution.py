import logging
import base64
import asyncio
import ast
import hashlib
import hmac
from urllib.parse import urlencode

from server_modules.builder_runtime_mapping import map_builder_permissions_to_runtime_metadata
from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.runs_engine import (
    ENGINE_REGISTRY,
    format_agent_summary,
    generate_with_candidate_failover,
    requires_human_approval,
    wait_for_human_response,
    resolve_run_execution_context,
    wait_for_human_decision,
)
from server_modules.runs_output import _compact_event_text, _json_safe
from server_modules.health_diagnostics import _build_skill_contract_from_metadata
from server_modules.runs_core import set_run_status, emit_log
from server_modules.file_mount_security import assert_file_mount_access
from server_modules.url_security import assert_safe_outbound_url

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

LOGGER = logging.getLogger(__name__)
NODE_TERMINAL_STATUSES = {"succeeded", "failed", "skipped"}


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


def _workflow_definition_from_context(context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw = context.get("workflow_definition")
    if isinstance(raw, dict) and isinstance(raw.get("nodes"), list):
        return raw
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    raw = metadata.get("workflow_definition")
    if isinstance(raw, dict) and isinstance(raw.get("nodes"), list):
        return raw
    return None


def _workflow_label(node: Dict[str, Any]) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    config = node.get("config") if isinstance(node.get("config"), dict) else {}
    identity = config.get("identity") if isinstance(config.get("identity"), dict) else {}
    return (
        str(data.get("label") or "").strip()
        or str(node.get("label") or "").strip()
        or str(identity.get("name") or identity.get("role") or "").strip()
        or str(node.get("id") or "").strip()
        or "Node"
    )


def _workflow_text_payload(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=True, indent=2)
        except Exception:
            return str(value)
    return str(value or "").strip()


def _node_preview_text(value: Any, *, limit: int = 280) -> Optional[str]:
    text = _workflow_text_payload(value)
    if not text:
        return None
    return _compact_event_text(text, limit=limit)


def _node_detail_payload(value: Any) -> Optional[Any]:
    if value is None:
        return None
    safe = _json_safe(value)
    if isinstance(safe, (dict, list)):
        return safe
    return _node_preview_text(safe, limit=400)


def _ensure_run_node_states(
    run_id: str,
    *,
    graph_kind: str,
    nodes: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        return None
    existing = run.get("node_states") if isinstance(run.get("node_states"), dict) else None
    if not existing or str(existing.get("graph_kind") or "").strip().lower() != str(graph_kind or "").strip().lower():
        existing = {
            "version": 1,
            "graph_kind": str(graph_kind or "").strip().lower() or "workflow",
            "active_node_id": None,
            "final_node_id": None,
            "order": [],
            "items": {},
            "updated_at": _utc_now_iso(),
        }
        run["node_states"] = existing

    items = existing.get("items") if isinstance(existing.get("items"), dict) else {}
    order: List[str] = []
    for raw_node in nodes:
        if not isinstance(raw_node, dict):
            continue
        node_id = str(raw_node.get("id") or "").strip()
        if not node_id:
            continue
        order.append(node_id)
        current = items.get(node_id) if isinstance(items.get(node_id), dict) else {}
        if existing["graph_kind"] == "workflow":
            node_type = str(raw_node.get("type") or "").strip().lower() or "node"
            variant = str(raw_node.get("variant") or "").strip().lower() or None
            label = _workflow_label(raw_node)
        else:
            node_type = "dag"
            variant = str(raw_node.get("kind") or "").strip().lower() or None
            label = str(raw_node.get("label") or node_id).strip() or node_id
        items[node_id] = {
            "node_id": node_id,
            "label": label,
            "type": node_type,
            "variant": variant,
            "status": str(current.get("status") or "queued").strip().lower() or "queued",
            "started_at": current.get("started_at"),
            "completed_at": current.get("completed_at"),
            "duration_ms": current.get("duration_ms"),
            "input_preview": current.get("input_preview"),
            "output_preview": current.get("output_preview"),
            "summary": current.get("summary"),
            "error": current.get("error"),
            "detail": current.get("detail"),
            "child_run_id": current.get("child_run_id"),
            "child_workflow_id": current.get("child_workflow_id"),
            "waiting_for_approval": bool(current.get("waiting_for_approval")),
            "_started_mono": current.get("_started_mono"),
        }
    existing["items"] = items
    existing["order"] = order
    existing["updated_at"] = _utc_now_iso()
    run["node_states"] = existing
    return existing


def _update_run_node_state(
    run_id: str,
    node_id: str,
    *,
    status: Optional[str] = None,
    activate: bool = False,
    finalize: bool = False,
    label: Optional[str] = None,
    node_type: Optional[str] = None,
    variant: Optional[str] = None,
    input_preview: Optional[str] = None,
    output_preview: Optional[str] = None,
    summary: Optional[str] = None,
    error: Optional[str] = None,
    detail: Any = None,
    child_run_id: Optional[str] = None,
    child_workflow_id: Optional[str] = None,
    waiting_for_approval: Optional[bool] = None,
    reset_started: bool = False,
) -> None:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        return
    node_states = run.get("node_states") if isinstance(run.get("node_states"), dict) else None
    if not node_states:
        return
    items = node_states.get("items") if isinstance(node_states.get("items"), dict) else {}
    item = items.get(node_id) if isinstance(items.get(node_id), dict) else {"node_id": node_id}
    previous_status = str(item.get("status") or "").strip().lower()
    if label is not None:
        item["label"] = label
    if node_type is not None:
        item["type"] = node_type
    if variant is not None:
        item["variant"] = variant or None
    timestamp = _utc_now_iso()
    if activate:
        node_states["active_node_id"] = node_id
    if status:
        clean_status = str(status or "").strip().lower()
        item["status"] = clean_status
        if clean_status == "running":
            if reset_started or not item.get("started_at"):
                item["started_at"] = timestamp
                item["_started_mono"] = time.monotonic()
            item["completed_at"] = None
            item["duration_ms"] = None
            item["error"] = None
            if waiting_for_approval is None:
                item["waiting_for_approval"] = False
        elif clean_status == "waiting_human":
            if not item.get("started_at"):
                item["started_at"] = timestamp
                item["_started_mono"] = time.monotonic()
            if waiting_for_approval is None:
                item["waiting_for_approval"] = True
        elif clean_status in NODE_TERMINAL_STATUSES:
            item["completed_at"] = timestamp
            started_mono = item.get("_started_mono")
            if isinstance(started_mono, (int, float)):
                item["duration_ms"] = round(max(0.0, (time.monotonic() - started_mono) * 1000.0), 2)
            node_states["active_node_id"] = None
            if finalize:
                node_states["final_node_id"] = node_id
            if waiting_for_approval is None:
                item["waiting_for_approval"] = False
    if input_preview is not None:
        item["input_preview"] = input_preview or None
    if output_preview is not None:
        item["output_preview"] = output_preview or None
    if summary is not None:
        item["summary"] = summary or None
    if error is not None:
        item["error"] = error or None
    if detail is not None:
        item["detail"] = _node_detail_payload(detail)
    if child_run_id is not None:
        item["child_run_id"] = child_run_id or None
    if child_workflow_id is not None:
        item["child_workflow_id"] = child_workflow_id or None
    if waiting_for_approval is not None:
        item["waiting_for_approval"] = bool(waiting_for_approval)
    items[node_id] = item
    node_states["items"] = items
    node_states["updated_at"] = timestamp
    run["node_states"] = node_states
    if status:
        clean_status = str(status or "").strip().lower()
        if clean_status and clean_status != previous_status:
            emit_log(
                run["logs"],
                "info" if clean_status not in {"failed"} else "error",
                f"Node state: {str(item.get('label') or node_id).strip() or node_id} -> {clean_status}",
                event="node_state",
                data={
                    "graph_kind": node_states.get("graph_kind"),
                    "node_id": node_id,
                    "label": item.get("label"),
                    "type": item.get("type"),
                    "variant": item.get("variant"),
                    "status": clean_status,
                    "active_node_id": node_states.get("active_node_id"),
                    "final_node_id": node_states.get("final_node_id"),
                    "waiting_for_approval": bool(item.get("waiting_for_approval")),
                },
            )


def _workflow_variant_default_tool_id(variant: str) -> str:
    mapping = {
        "shell": "execute_shell_command",
        "code": "",
        "browser": "browser_automation",
        "file": "read_write_files",
        "document": "document_create",
        "spreadsheet": "spreadsheet_update",
    }
    return mapping.get(str(variant or "").strip().lower(), "")


def _workflow_tool_policy_tool_id(variant: str, config: Dict[str, Any]) -> str:
    clean_variant = str(variant or "").strip().lower()
    if clean_variant == "code":
        return ""
    if clean_variant == "connector_action":
        action_id = normalize_action_id(config.get("action_id"))
        action_mapping = {
            "send_email": "send_message",
            "send_message": "send_message",
            "send_embed": "send_message",
            "send_dm": "send_message",
            "publish_reply": "send_message",
            "send_media": "send_message",
            "update_message": "send_message",
            "draft_email": "draft_email",
            "create_calendar_event": "create_calendar_event",
            "create_doc": "document_create",
            "create_document": "document_create",
            "create_sheet": "spreadsheet_create",
            "create_spreadsheet": "spreadsheet_create",
            "upload_drive_file": "read_write_files",
            "http_request": "http_request",
            "signed_webhook": "http_request",
        }
        return action_mapping.get(action_id, action_id)
    if clean_variant == "spreadsheet":
        operation = normalize_action_id(config.get("operation") or "read")
        if operation == "append":
            return "spreadsheet_append"
        if operation in {"update", "edit"}:
            return "spreadsheet_update"
        if operation in {"create", "new"}:
            return "spreadsheet_create"
        return "spreadsheet_read"
    if clean_variant == "document":
        operation = normalize_action_id(config.get("operation") or "create")
        file_path = str(config.get("file_path") or config.get("path") or "").strip().lower()
        if file_path.endswith(".pptx"):
            return "presentation_update" if operation in {"update", "edit", "append"} else "presentation_create"
        return "document_update" if operation in {"update", "edit", "append"} else "document_create"
    return normalize_action_id(config.get("action_id") or _workflow_variant_default_tool_id(clean_variant))


def _predict_tool_ids_from_workflow_definition(definition: Dict[str, Any]) -> List[str]:
    nodes = definition.get("nodes") if isinstance(definition.get("nodes"), list) else []
    out: List[str] = []
    seen: Set[str] = set()

    def _append(raw_tool: Any) -> None:
        clean = normalize_action_id(raw_tool)
        if clean and clean not in seen:
            seen.add(clean)
            out.append(clean)

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "").strip().lower()
        variant = str(node.get("variant") or "").strip().lower()
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        if node_type == "agent":
            tools = config.get("tools") if isinstance(config.get("tools"), dict) else {}
            for item in tools.get("dynamic_allowed") if isinstance(tools.get("dynamic_allowed"), list) else []:
                _append(item)
            for item in tools.get("explicit_required") if isinstance(tools.get("explicit_required"), list) else []:
                _append(item)
        elif node_type == "tool":
            _append(_workflow_tool_policy_tool_id(variant, config))
    return out


def _predict_tool_ids_for_context(context: Dict[str, Any]) -> List[str]:
    workflow_definition = _workflow_definition_from_context(context)
    if isinstance(workflow_definition, dict):
        predicted = _predict_tool_ids_from_workflow_definition(workflow_definition)
        if predicted:
            return predicted

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


def _browser_automation_policy_from_operations(browser_ops: List[Dict[str, Any]]) -> Dict[str, Any]:
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
    elif session_profiles:
        requires_approval = True
        approval_reason = "session-backed browser automation requires approval"

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
    return _browser_automation_policy_from_operations(browser_ops)


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
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if message == "Run queued for Local Companion execution." and bool(metadata.get("execution_target_waiting_for_runtime")):
        waiting_reason = str(metadata.get("execution_target_reason") or "").strip()
        if waiting_reason:
            message = waiting_reason
    if message == "Run queued for Local Companion execution." and bool(metadata.get("execution_target_waiting_for_capacity")):
        waiting_reason = str(metadata.get("execution_target_reason") or "").strip()
        if waiting_reason:
            message = waiting_reason
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
        data={
            "run_id": run_id,
            "lease_seconds": ORION_LOCAL_LEASE_SECONDS,
            "waiting_for_runtime": bool(metadata.get("execution_target_waiting_for_runtime")),
            "required_capabilities": list(metadata.get("execution_target_required_capabilities") or []),
            "missing_capabilities": list(metadata.get("execution_target_missing_capabilities") or []),
            "matching_runtime_ids": list(metadata.get("execution_target_matching_runtime_ids") or []),
            "available_runtime_ids": list(metadata.get("execution_target_available_runtime_ids") or []),
            "busy_runtime_ids": list(metadata.get("execution_target_busy_runtime_ids") or []),
            "preferred_runtime_id": metadata.get("execution_target_preferred_runtime_id"),
            "preferred_runtime_label": metadata.get("execution_target_preferred_runtime_label"),
            "waiting_for_capacity": bool(metadata.get("execution_target_waiting_for_capacity")),
        },
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
    metadata = run_context.get("metadata") if isinstance(run_context.get("metadata"), dict) else {}
    runtime_profile_id = str(
        metadata.get("runtime_profile_id") or metadata.get("profile_id") or ""
    ).strip()
    runtime_profile = PROVIDER_PROFILES.get(runtime_profile_id) if runtime_profile_id else None
    runtime_profile_row = runtime_profile if isinstance(runtime_profile, dict) else {}
    initial_active_provider = str(
        runtime_profile_row.get("provider")
        or metadata.get("runtime_profile_provider")
        or run_context.get("provider")
        or ""
    ).strip()
    initial_active_model = str(
        runtime_profile_row.get("model")
        or metadata.get("runtime_profile_model")
        or run_context.get("model")
        or ""
    ).strip()
    initial_active_label = str(
        runtime_profile_row.get("label")
        or metadata.get("runtime_profile_label")
        or ""
    ).strip()
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
        "node_states": None,
        "tool_policy_audit": [],
        "memory_trace": {
            "enabled": ORION_MEMORY_ENABLED,
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": _utc_now_iso(),
        },
        "active_profile_id": runtime_profile_id or None,
        "active_profile_label": initial_active_label or None,
        "active_provider": initial_active_provider or None,
        "active_model": initial_active_model or None,
        "active_adapter": None,
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


def _workflow_outgoing_edges(edges: List[Dict[str, Any]], node_id: str) -> List[Dict[str, Any]]:
    return [
        edge
        for edge in edges
        if isinstance(edge, dict) and str(edge.get("source") or "").strip() == node_id
    ]


def _workflow_next_node_id(
    edges: List[Dict[str, Any]],
    node_id: str,
    *,
    preferred_handle: Optional[str] = None,
) -> Optional[str]:
    outgoing = _workflow_outgoing_edges(edges, node_id)
    if preferred_handle:
        desired = str(preferred_handle or "").strip().lower()
        for edge in outgoing:
            if str(edge.get("sourceHandle") or "").strip().lower() == desired:
                target = str(edge.get("target") or "").strip()
                if target:
                    return target
    for edge in outgoing:
        target = str(edge.get("target") or "").strip()
        if target:
            return target
    return None


def _build_workflow_agent_system_prompt(config: Dict[str, Any]) -> str:
    identity = config.get("identity") if isinstance(config.get("identity"), dict) else {}
    runtime = config.get("runtime") if isinstance(config.get("runtime"), dict) else {}
    skills = config.get("skills") if isinstance(config.get("skills"), dict) else {}
    tools = config.get("tools") if isinstance(config.get("tools"), dict) else {}
    memory = config.get("memory") if isinstance(config.get("memory"), dict) else {}
    connectors = config.get("connectors") if isinstance(config.get("connectors"), dict) else {}
    permissions = config.get("permissions") if isinstance(config.get("permissions"), dict) else {}

    lines = [
        f"You are workflow node '{str(identity.get('name') or identity.get('role') or 'Agent').strip() or 'Agent'}'.",
        f"Role: {str(identity.get('role') or 'Agent').strip() or 'Agent'}",
        f"Goal: {str(identity.get('goal') or 'Complete the assigned workflow step.').strip()}",
    ]
    success_condition = str(identity.get("success_condition") or "").strip()
    if success_condition:
        lines.append(f"Success condition: {success_condition}")
    output_contract = str(identity.get("output_contract") or "").strip()
    if output_contract:
        lines.append(f"Output contract: {output_contract}")
    skill_ids = skills.get("skill_bundle_ids") if isinstance(skills.get("skill_bundle_ids"), list) else []
    if skill_ids:
        lines.append(f"Skill bundles: {', '.join(str(item).strip() for item in skill_ids if str(item).strip())}")
    prompt_append = str(skills.get("prompt_append") or "").strip()
    if prompt_append:
        lines.append(f"Skill guidance: {prompt_append}")
    dynamic_allowed = tools.get("dynamic_allowed") if isinstance(tools.get("dynamic_allowed"), list) else []
    explicit_required = tools.get("explicit_required") if isinstance(tools.get("explicit_required"), list) else []
    lines.append(
        "Dynamic tools allowed: "
        + (", ".join(str(item).strip() for item in dynamic_allowed if str(item).strip()) if dynamic_allowed else "none")
    )
    if explicit_required:
        lines.append(
            "Operations requiring explicit tool nodes: "
            + ", ".join(str(item).strip() for item in explicit_required if str(item).strip())
        )
    read_scopes = memory.get("read_scopes") if isinstance(memory.get("read_scopes"), list) else []
    write_scopes = memory.get("write_scopes") if isinstance(memory.get("write_scopes"), list) else []
    lines.append(
        "Memory policy: "
        f"read={','.join(str(item).strip() for item in read_scopes if str(item).strip()) or 'session'}; "
        f"write={','.join(str(item).strip() for item in write_scopes if str(item).strip()) or 'session'}; "
        f"retrieval={str(memory.get('retrieval_policy') or 'recent').strip() or 'recent'}"
    )
    bindings = connectors.get("bindings") if isinstance(connectors.get("bindings"), list) else []
    if bindings:
        lines.append(f"Connector bindings: {json.dumps(_json_safe(bindings), ensure_ascii=True)}")
    lines.append(
        "Permission policy: "
        f"action_policy={str(permissions.get('action_policy') or 'guarded').strip() or 'guarded'}; "
        f"execution_target={str(runtime.get('execution_target') or 'auto').strip() or 'auto'}"
    )
    lines.append("Be concise, operational, and produce output for the next workflow node.")
    return "\n".join(lines)


def _resolve_agent_generation_state(base_context: Dict[str, Any], config: Dict[str, Any]) -> tuple[Dict[str, Any], Dict[str, Any]]:
    runtime = config.get("runtime") if isinstance(config.get("runtime"), dict) else {}
    execution_context = dict(base_context)
    metadata = dict(base_context.get("metadata") if isinstance(base_context.get("metadata"), dict) else {})
    profile_id = str(runtime.get("provider_profile_id") or "").strip()
    provider = str(runtime.get("provider") or execution_context.get("provider") or metadata.get("provider") or "openai").strip()
    model = str(runtime.get("model") or execution_context.get("model") or metadata.get("model") or "").strip()
    if profile_id:
        metadata["profile_id"] = profile_id
    if provider:
        metadata["provider"] = provider
        execution_context["provider"] = provider
    if model:
        metadata["model"] = model
        execution_context["model"] = model
    execution_context["metadata"] = metadata
    provider_id, selected_model, candidates, _ = resolve_run_execution_context(execution_context)
    return execution_context, {
        "provider": provider_id,
        "selected_model": str(selected_model),
        "credential_candidates": candidates,
        "credentials": candidates[0].get("credentials") if candidates else {},
    }


def _workflow_decision_value(current_text: str, state: Dict[str, Any], expression: str) -> bool:
    scope = {
        "context_text": current_text,
        "result_text": current_text,
        "result_data": state.get("last_data") if isinstance(state.get("last_data"), dict) else {},
        "state": state,
    }
    parsed = ast.parse(expression, mode="eval")

    def _resolve_name(name: str) -> Any:
        if name in scope:
            return scope[name]
        if name == "True":
            return True
        if name == "False":
            return False
        if name == "None":
            return None
        raise ValueError(f"Unsupported decision name '{name}'.")

    def _resolve_attribute(value: Any, attr: str) -> Any:
        if attr.startswith("__"):
            raise ValueError("Decision expressions cannot access dunder attributes.")
        if isinstance(value, dict):
            return value.get(attr)
        return getattr(value, attr)

    def _resolve_subscript(value: Any, node: ast.Subscript) -> Any:
        key = _evaluate(node.slice)
        if isinstance(value, dict):
            return value.get(key)
        return value[key]

    def _compare(operator_node: ast.cmpop, left: Any, right: Any) -> bool:
        if isinstance(operator_node, ast.Eq):
            return left == right
        if isinstance(operator_node, ast.NotEq):
            return left != right
        if isinstance(operator_node, ast.Gt):
            return left > right
        if isinstance(operator_node, ast.GtE):
            return left >= right
        if isinstance(operator_node, ast.Lt):
            return left < right
        if isinstance(operator_node, ast.LtE):
            return left <= right
        if isinstance(operator_node, ast.In):
            return left in right
        if isinstance(operator_node, ast.NotIn):
            return left not in right
        if isinstance(operator_node, ast.Is):
            return left is right
        if isinstance(operator_node, ast.IsNot):
            return left is not right
        raise ValueError(f"Unsupported decision comparator '{type(operator_node).__name__}'.")

    def _evaluate(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _evaluate(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return _resolve_name(node.id)
        if isinstance(node, ast.Attribute):
            return _resolve_attribute(_evaluate(node.value), node.attr)
        if isinstance(node, ast.Subscript):
            return _resolve_subscript(_evaluate(node.value), node)
        if isinstance(node, ast.BoolOp):
            values = [_evaluate(value) for value in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
            raise ValueError(f"Unsupported decision boolean operator '{type(node.op).__name__}'.")
        if isinstance(node, ast.UnaryOp):
            operand = _evaluate(node.operand)
            if isinstance(node.op, ast.Not):
                return not operand
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
            raise ValueError(f"Unsupported decision unary operator '{type(node.op).__name__}'.")
        if isinstance(node, ast.Compare):
            left_value = _evaluate(node.left)
            comparisons = zip(node.ops, node.comparators)
            for operator_node, comparator in comparisons:
                right_value = _evaluate(comparator)
                if not _compare(operator_node, left_value, right_value):
                    return False
                left_value = right_value
            return True
        if isinstance(node, ast.List):
            return [_evaluate(item) for item in node.elts]
        if isinstance(node, ast.Tuple):
            return tuple(_evaluate(item) for item in node.elts)
        if isinstance(node, ast.Dict):
            return {_evaluate(key): _evaluate(value) for key, value in zip(node.keys, node.values)}
        raise ValueError(f"Unsupported decision expression node '{type(node).__name__}'.")

    return bool(_evaluate(parsed))


def _workflow_tool_text_input(config: Dict[str, Any], current_text: str) -> str:
    for candidate in [
        config.get("text"),
        config.get("body_text"),
        config.get("body"),
        config.get("message"),
        config.get("content"),
        current_text,
    ]:
        text = _workflow_text_payload(candidate)
        if text:
            return text
    return ""


def _workflow_tool_workspace_id(context: Dict[str, Any]) -> Optional[str]:
    workspace_id = str(context.get("workspace_id") or "").strip()
    return workspace_id or None


def _workflow_tool_connector_secret(
    context: Dict[str, Any],
    config: Dict[str, Any],
) -> tuple[str, str, Dict[str, Any]]:
    requested_connector = str(config.get("connector") or "").strip().lower()
    if not requested_connector:
        raise RuntimeError("Connector action tool node is missing connector.")

    workspace_id = _workflow_tool_workspace_id(context)
    explicit_ids = [
        str(config.get("binding_id") or "").strip(),
        str(config.get("connector_credential_id") or "").strip(),
        str(config.get("credential_id") or "").strip(),
    ]
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    explicit_ids.append(str(metadata.get("connector_credential_id") or "").strip())

    for credential_id in explicit_ids:
        if not credential_id:
            continue
        secret = resolve_vault_credential(credential_id, workspace_id)
        provider = str(secret.get("_provider") or "").strip().lower()
        if provider == requested_connector:
            return credential_id, requested_connector, secret

    candidates = [
        item
        for item in list_vault_connectors(workspace_id)
        if isinstance(item, dict) and str(item.get("connector") or "").strip().lower() == requested_connector
    ]
    if not candidates:
        raise RuntimeError(f"No connector binding is available for '{requested_connector}'.")
    candidates.sort(key=lambda item: parse_iso_datetime(item.get("updated_at")), reverse=True)
    selected = candidates[0]
    credential_id = str(selected.get("id") or "").strip()
    if not credential_id:
        raise RuntimeError(f"Connector binding for '{requested_connector}' is invalid.")
    secret = resolve_vault_credential(credential_id, workspace_id)
    return credential_id, requested_connector, secret


def _workflow_tool_connector_headers(secret: Dict[str, Any]) -> Dict[str, str]:
    access_token = str(secret.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("Connector access token is missing.")
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def _workflow_whatsapp_number(raw_value: Any) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""
    if value.lower().startswith("whatsapp:"):
        return value
    return f"whatsapp:{value}"


def _workflow_http_headers(value: Any) -> Dict[str, str]:
    headers = value if isinstance(value, dict) else {}
    normalized: Dict[str, str] = {}
    for raw_key, raw_header_value in headers.items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        normalized[key] = str(raw_header_value or "").strip()
    return normalized


def _workflow_tool_create_child_local_run(
    run_id: str,
    context: Dict[str, Any],
    *,
    label: str,
    operation: Dict[str, Any],
    summary: str,
) -> str:
    from server_modules.runtime_models import RunStartRequest
    from server_modules.runs_delegation import _create_run_from_request as _create_child_run

    child_metadata = dict(context.get("metadata") if isinstance(context.get("metadata"), dict) else {})
    child_metadata.update(
        {
            "outcome_pack": LOCAL_EXECUTION_PACK_ID,
            "execution_target": EXECUTION_TARGET_LOCAL_COMPANION,
            "trust_mode": TRUST_MODE_AUTO,
            "pack_inputs": {"operations": [operation]},
            "subflow_parent_run_id": run_id,
            "workflow_tool_parent_run_id": run_id,
        }
    )
    child_req = RunStartRequest(
        engine=str(context.get("engine") or "orion"),
        workflow_id=None,
        workspace_id=context.get("workspace_id"),
        user_goal=summary or f"Execute local workflow tool node: {label}",
        business_plan=context.get("business_plan"),
        agent_role=context.get("agent_role"),
        provider=context.get("provider"),
        model=context.get("model"),
        credential_id=context.get("credential_id"),
        parent_run_id=run_id,
        metadata=child_metadata,
    )
    child_result = _create_child_run(child_req)
    route = child_result.get("route") if isinstance(child_result.get("route"), dict) else {}
    if str(route.get("selected") or "").strip().lower() != EXECUTION_TARGET_LOCAL_COMPANION:
        raise RuntimeError(f"Local tool node '{label}' requires a local_companion route.")
    child_run_id = str(child_result.get("run_id") or "").strip()
    if not child_run_id:
        raise RuntimeError(f"Local tool node '{label}' did not produce a child run id.")
    return child_run_id


def _workflow_wait_for_child_run(
    child_run_id: str,
    *,
    timeout_seconds: int,
    on_waiting_for_input: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    on_resumed: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    deadline = time.monotonic() + max(5, int(timeout_seconds or 300))
    waiting_emitted = False
    while True:
        if time.monotonic() > deadline:
            raise RuntimeError(f"Child run '{child_run_id}' did not finish within {timeout_seconds}s.")
        child_run = runs.get(child_run_id)
        if not isinstance(child_run, dict):
            time.sleep(0.25)
            continue
        child_status = str(child_run.get("status") or "").strip().lower()
        if child_status == "waiting_for_input":
            if not waiting_emitted and callable(on_waiting_for_input):
                on_waiting_for_input(child_run_id, child_run)
            waiting_emitted = True
            time.sleep(0.25)
            continue
        if waiting_emitted and callable(on_resumed):
            on_resumed(child_run_id, child_run)
            waiting_emitted = False
        if child_status == "completed":
            return child_run
        if child_status in {"failed", "timeout", "cancelled", "stopped"}:
            raise RuntimeError(f"Child run '{child_run_id}' ended with status '{child_status}'.")
        time.sleep(0.25)


def _workflow_execute_connector_action(
    context: Dict[str, Any],
    config: Dict[str, Any],
    *,
    current_text: str,
) -> Dict[str, Any]:
    requested_connector = str(config.get("connector") or "").strip().lower()
    action_id = normalize_action_id(config.get("action_id"))
    if not action_id:
        raise RuntimeError("Connector action tool node is missing action_id.")
    if not requested_connector:
        raise RuntimeError("Connector action tool node is missing connector.")

    if requested_connector == "custom_api" and action_id in {"http_request", "signed_webhook"}:
        method = str(config.get("method") or ("POST" if action_id == "signed_webhook" else "GET")).strip().upper() or "GET"
        url = str(config.get("url") or "").strip()
        if not url:
            raise RuntimeError(f"Connector action '{requested_connector}.{action_id}' requires a URL.")
        assert_safe_outbound_url(url)
        headers = _workflow_http_headers(config.get("headers"))
        payload_value = config.get("payload")
        if payload_value is None and method != "GET":
            payload_value = {"context": _workflow_tool_text_input(config, current_text)}
        request_payload: Any = payload_value
        if action_id == "signed_webhook":
            signing_secret = str(
                config.get("signing_secret")
                or config.get("secret")
                or ""
            ).strip()
            if not signing_secret:
                raise RuntimeError("signed_webhook requires signing_secret.")
            if isinstance(payload_value, (bytes, bytearray)):
                body_bytes = bytes(payload_value)
            else:
                body_bytes = json.dumps(payload_value if payload_value is not None else {}).encode("utf-8")
                headers.setdefault("Content-Type", "application/json")
            signature = hmac.new(
                signing_secret.encode("utf-8"),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers.setdefault("X-Empyralist-Signature-SHA256", signature)
            request_payload = body_bytes
        response = http_json_request(
            url,
            method=method,
            headers=headers,
            payload=request_payload,
            timeout=max(5, int(config.get("timeout_seconds") or 30)),
        )
        status_code = int(response.get("status") or 500)
        if status_code >= 400:
            body = response.get("json") if isinstance(response.get("json"), dict) else {}
            detail = str(body.get("message") or body.get("detail") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"Custom API request failed with status {status_code}.")
        result = response.get("json") if response.get("json") is not None else response.get("text")
        return {
            "summary": f"Connector action completed: custom_api.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": "custom_api",
                    "credential_id": None,
                    "action_id": action_id,
                    "url": url,
                    "method": method,
                    "result": _json_safe(result),
                }
            },
        }

    credential_id, connector_id, secret = _workflow_tool_connector_secret(context, config)
    workspace_id = _workflow_tool_workspace_id(context)

    if connector_id == "telegram_bot" and action_id in {"send_message", "send_media", "update_message"}:
        chat_id = str(config.get("chat_id") or secret.get("chat_id") or "").strip()
        if not chat_id:
            raise RuntimeError("Telegram connector action requires chat_id.")
        result = asyncio.run(
            handle_telegram_send_message(
                text=_workflow_tool_text_input(config, current_text),
                workspace_id=workspace_id,
                session_key=str(config.get("session_key") or "").strip() or None,
                chat_id=chat_id,
            )
        )
        return {
            "summary": f"Connector action completed: telegram_bot.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "discord_bot" and action_id in {"send_message", "send_embed"}:
        bot_token = str(secret.get("bot_token") or "").strip()
        channel_id = str(config.get("channel_id") or secret.get("channel_id") or "").strip()
        if not bot_token:
            raise RuntimeError("Discord connector action requires bot_token.")
        if not channel_id:
            raise RuntimeError("Discord connector action requires channel_id.")
        body_text = _workflow_tool_text_input(config, current_text)
        if action_id == "send_embed":
            embeds = config.get("embeds") if isinstance(config.get("embeds"), list) else None
            if embeds:
                payload = {"embeds": embeds}
            else:
                payload = {
                    "embeds": [
                        {
                            "title": str(
                                config.get("title")
                                or context.get("workflow_name")
                                or context.get("workflow_id")
                                or "Empyralist"
                            ).strip() or "Empyralist",
                            "description": body_text,
                        }
                    ]
                }
        else:
            payload = {"content": body_text}
        response = http_json_request(
            f"https://discord.com/api/v10/channels/{quote_plus(channel_id)}/messages",
            method="POST",
            headers={"Authorization": f"Bot {bot_token}", "Content-Type": "application/json"},
            payload=payload,
        )
        status_code = int(response.get("status") or 500)
        if status_code not in {200, 201}:
            body = response.get("json") if isinstance(response.get("json"), dict) else {}
            detail = str(body.get("message") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"Discord send failed with status {status_code}.")
        result = response.get("json") if isinstance(response.get("json"), dict) else response
        return {
            "summary": f"Connector action completed: discord_bot.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "channel_id": channel_id,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "whatsapp_twilio" and action_id == "send_message":
        account_sid = str(secret.get("account_sid") or "").strip()
        auth_token = str(secret.get("auth_token") or "").strip()
        from_number = _workflow_whatsapp_number(config.get("from_number") or secret.get("from_number"))
        to_number = _workflow_whatsapp_number(
            config.get("to_number")
            or config.get("recipient")
            or secret.get("to_number")
        )
        if not account_sid or not auth_token:
            raise RuntimeError("WhatsApp (Twilio) connector action requires account_sid and auth_token.")
        if not from_number or not to_number:
            raise RuntimeError("WhatsApp (Twilio) connector action requires from_number and to_number.")
        basic = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
        payload = urlencode(
            {
                "From": from_number,
                "To": to_number,
                "Body": _workflow_tool_text_input(config, current_text),
            }
        ).encode("utf-8")
        response = http_json_request(
            f"https://api.twilio.com/2010-04-01/Accounts/{quote_plus(account_sid)}/Messages.json",
            method="POST",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            payload=payload,
        )
        status_code = int(response.get("status") or 500)
        if status_code not in {200, 201}:
            body = response.get("json") if isinstance(response.get("json"), dict) else {}
            detail = str(body.get("message") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"Twilio send failed with status {status_code}.")
        result = response.get("json") if isinstance(response.get("json"), dict) else response
        return {
            "summary": f"Connector action completed: whatsapp_twilio.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "to_number": to_number,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "wechat_work" and action_id == "send_message":
        webhook_url = str(config.get("webhook_url") or secret.get("webhook_url") or "").strip()
        if not webhook_url:
            raise RuntimeError("WeChat Work connector action requires webhook_url.")
        body_text = _workflow_tool_text_input(config, current_text)
        payload = config.get("payload") if isinstance(config.get("payload"), dict) else {
            "msgtype": "text",
            "text": {
                "content": body_text,
            },
        }
        response = http_json_request(
            webhook_url,
            method="POST",
            headers={"Content-Type": "application/json"},
            payload=payload,
        )
        status_code = int(response.get("status") or 500)
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        if status_code != 200:
            detail = str(body.get("errmsg") or body.get("message") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"WeChat Work send failed with status {status_code}.")
        if int(body.get("errcode") or 0) != 0:
            detail = str(body.get("errmsg") or "").strip()
            raise RuntimeError(detail or "WeChat Work webhook was rejected.")
        return {
            "summary": f"Connector action completed: wechat_work.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "result": _json_safe(body or response),
                }
            },
        }

    if connector_id == "instagram_business" and action_id == "publish_reply":
        comment_id = str(config.get("comment_id") or config.get("media_comment_id") or "").strip()
        if not comment_id:
            raise RuntimeError("Instagram Business publish_reply requires comment_id.")
        payload = config.get("payload") if isinstance(config.get("payload"), dict) else {
            "message": _workflow_tool_text_input(config, current_text),
        }
        response = http_json_request(
            f"https://graph.facebook.com/v23.0/{quote_plus(comment_id)}/replies",
            method="POST",
            headers=_workflow_tool_connector_headers(secret),
            payload=payload,
        )
        status_code = int(response.get("status") or 500)
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        if status_code not in {200, 201}:
            error_obj = body.get("error") if isinstance(body, dict) else {}
            detail = (
                str(error_obj.get("message") or "").strip()
                if isinstance(error_obj, dict)
                else ""
            ) or str(body.get("message") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"Instagram publish_reply failed with status {status_code}.")
        return {
            "summary": f"Connector action completed: instagram_business.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "comment_id": comment_id,
                    "result": _json_safe(body or response),
                }
            },
        }

    if connector_id == "instagram_business" and action_id == "send_dm":
        page_id = str(config.get("page_id") or secret.get("page_id") or "").strip()
        recipient_id = str(
            config.get("recipient_id")
            or config.get("recipient")
            or config.get("user_id")
            or config.get("instagram_user_id")
            or ""
        ).strip()
        if not page_id:
            raise RuntimeError("Instagram Business send_dm requires page_id from config or binding.")
        if not recipient_id:
            raise RuntimeError("Instagram Business send_dm requires recipient_id.")
        payload = config.get("payload") if isinstance(config.get("payload"), dict) else {
            "messaging_product": "instagram",
            "recipient": {"id": recipient_id},
            "message": {"text": _workflow_tool_text_input(config, current_text)},
        }
        if isinstance(payload, dict):
            payload.setdefault("messaging_product", "instagram")
        response = http_json_request(
            f"https://graph.facebook.com/v23.0/{quote_plus(page_id)}/messages",
            method="POST",
            headers=_workflow_tool_connector_headers(secret),
            payload=payload,
        )
        status_code = int(response.get("status") or 500)
        body = response.get("json") if isinstance(response.get("json"), dict) else {}
        if status_code not in {200, 201}:
            error_obj = body.get("error") if isinstance(body, dict) else {}
            detail = (
                str(error_obj.get("message") or "").strip()
                if isinstance(error_obj, dict)
                else ""
            ) or str(body.get("message") or response.get("text") or "").strip()
            raise RuntimeError(detail or f"Instagram send_dm failed with status {status_code}.")
        return {
            "summary": f"Connector action completed: instagram_business.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "page_id": page_id,
                    "recipient_id": recipient_id,
                    "result": _json_safe(body or response),
                }
            },
        }

    if connector_id in {"google_workspace", "microsoft_365"} and action_id in {"send_email", "send_message", "draft_email"}:
        to_email = str(
            config.get("to_email")
            or config.get("to")
            or config.get("email")
            or config.get("recipient")
            or ""
        ).strip()
        if not to_email:
            raise RuntimeError(f"Connector action '{action_id}' requires a recipient email.")
        subject = str(config.get("subject") or f"Empyralist workflow: {context.get('workflow_name') or context.get('workflow_id') or 'Untitled'}").strip()
        body_text = _workflow_tool_text_input(config, current_text)
        if connector_id == "google_workspace":
            if google_workspace_uses_local_cli(secret):
                result = (
                    google_workspace_local_create_draft(secret, to_email, subject, body_text)
                    if action_id == "draft_email"
                    else google_workspace_local_send_message(secret, to_email, subject, body_text)
                )
            else:
                message = (
                    f"To: {to_email}\r\n"
                    f"Subject: {subject}\r\n"
                    "Content-Type: text/plain; charset=UTF-8\r\n"
                    "\r\n"
                    f"{body_text}\r\n"
                )
                raw_encoded = base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8").rstrip("=")
                if action_id == "draft_email":
                    payload = {"message": {"raw": raw_encoded}}
                    response = http_json_request(
                        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
                        method="POST",
                        headers=_workflow_tool_connector_headers(secret),
                        payload=payload,
                    )
                else:
                    payload = {"raw": raw_encoded}
                    response = http_json_request(
                        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                        method="POST",
                        headers=_workflow_tool_connector_headers(secret),
                        payload=payload,
                    )
                result = response.get("json") if isinstance(response.get("json"), dict) else response
        else:
            result = (
                microsoft_365_create_draft(secret, http_json_request, to_email, subject, body_text)
                if action_id == "draft_email"
                else microsoft_365_send_message(secret, http_json_request, to_email, subject, body_text)
            )
        return {
            "summary": f"Connector action completed: {connector_id}.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "recipient": to_email,
                    "subject": subject,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id in {"google_workspace", "microsoft_365"} and action_id == "create_calendar_event":
        payload = config.get("payload") if isinstance(config.get("payload"), dict) else {}
        if not payload:
            start = str(config.get("start") or "").strip()
            end = str(config.get("end") or "").strip()
            timezone = str(config.get("timezone") or "UTC").strip() or "UTC"
            if not start or not end:
                raise RuntimeError("create_calendar_event requires payload or start/end values.")
            title = str(config.get("title") or "Empyralist workflow event").strip() or "Empyralist workflow event"
            description = str(config.get("description") or current_text or "").strip()
            if connector_id == "microsoft_365":
                payload = {
                    "subject": title,
                    "body": {"contentType": "Text", "content": description},
                    "start": {"dateTime": start, "timeZone": timezone},
                    "end": {"dateTime": end, "timeZone": timezone},
                }
            else:
                payload = {
                    "summary": title,
                    "description": description,
                    "start": {"dateTime": start, "timeZone": timezone},
                    "end": {"dateTime": end, "timeZone": timezone},
                }
        if connector_id == "microsoft_365":
            result = microsoft_365_create_calendar_event(secret, http_json_request, payload=payload)
        else:
            calendar_id = str(config.get("calendar_id") or "primary").strip() or "primary"
            if google_workspace_uses_local_cli(secret):
                result = google_workspace_local_create_calendar_event(
                    secret,
                    calendar_id=calendar_id,
                    send_updates="none",
                    payload=payload,
                )
            else:
                url = (
                    f"https://www.googleapis.com/calendar/v3/calendars/{quote_plus(calendar_id)}"
                    f"/events?sendUpdates=none"
                )
                response = http_json_request(
                    url,
                    method="POST",
                    headers=_workflow_tool_connector_headers(secret),
                    payload=payload,
                )
                result = response.get("json") if isinstance(response.get("json"), dict) else response
        return {
            "summary": f"Connector action completed: {connector_id}.create_calendar_event.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "microsoft_365" and action_id == "upload_drive_file":
        drive_path = str(config.get("path") or config.get("file_path") or "").strip()
        if not drive_path:
            raise RuntimeError("upload_drive_file requires path or file_path.")
        content_value = config.get("content")
        if content_value is None:
            content_value = current_text
        if isinstance(content_value, (dict, list)):
            content_bytes = json.dumps(content_value).encode("utf-8")
            content_type = "application/json"
        elif isinstance(content_value, (bytes, bytearray)):
            content_bytes = bytes(content_value)
            content_type = str(config.get("content_type") or "application/octet-stream").strip() or "application/octet-stream"
        else:
            content_bytes = str(content_value or "").encode("utf-8")
            content_type = str(config.get("content_type") or "text/plain; charset=utf-8").strip() or "text/plain; charset=utf-8"
        result = microsoft_365_upload_drive_file(
            secret,
            drive_path,
            content_bytes,
            content_type=content_type,
        )
        return {
            "summary": f"Connector action completed: microsoft_365.upload_drive_file.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "path": drive_path,
                    "content_type": content_type,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "google_workspace" and action_id in {"create_doc", "create_document"}:
        title = str(config.get("title") or "Empyralist Document").strip() or "Empyralist Document"
        result = google_workspace_create_document(secret, title)
        return {
            "summary": f"Connector action completed: google_workspace.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "title": title,
                    "result": _json_safe(result),
                }
            },
        }

    if connector_id == "google_workspace" and action_id in {"create_sheet", "create_spreadsheet"}:
        title = str(config.get("title") or "Empyralist Sheet").strip() or "Empyralist Sheet"
        result = google_workspace_create_spreadsheet(secret, title)
        return {
            "summary": f"Connector action completed: google_workspace.{action_id}.",
            "result_data": {
                "connector_action": {
                    "connector": connector_id,
                    "credential_id": credential_id,
                    "action_id": action_id,
                    "title": title,
                    "result": _json_safe(result),
                }
            },
        }

    raise RuntimeError(f"Connector action '{connector_id}.{action_id}' is not executable in the Orion graph runtime yet.")


def _workflow_execute_document_or_spreadsheet_tool(
    context: Dict[str, Any],
    config: Dict[str, Any],
    *,
    variant: str,
) -> Dict[str, Any]:
    metadata = dict(context.get("metadata") if isinstance(context.get("metadata"), dict) else {})
    pack_inputs = {
        "file_path": config.get("file_path") or config.get("path"),
        "operation": config.get("operation") or ("create" if variant == "document" else "read"),
        "title": config.get("title"),
        "payload": config.get("payload"),
        "rows": config.get("rows"),
        "values": config.get("values"),
        "row_index": config.get("row_index"),
        "sheet_name": config.get("sheet_name"),
        "row_limit": config.get("row_limit"),
        "overwrite": config.get("overwrite"),
    }
    connector_credential_id = str(
        config.get("binding_id")
        or config.get("connector_credential_id")
        or config.get("credential_id")
        or metadata.get("connector_credential_id")
        or ""
    ).strip()
    if connector_credential_id:
        metadata["connector_credential_id"] = connector_credential_id
    metadata["pack_inputs"] = {key: value for key, value in pack_inputs.items() if value is not None}
    pack_id = DOCUMENT_STUDIO_PACK_ID if variant == "document" else SPREADSHEET_OPS_PACK_ID
    raw_result = execute_outcome_pack(pack_id, {"metadata": metadata}, run_id=context.get("run_id"))
    result_data = normalize_pack_result(pack_id, raw_result)
    summary = str(result_data.get("summary") or f"{variant.title()} tool completed.").strip()
    return {
        "summary": summary,
        "result_data": {
            "pack_id": pack_id,
            "tool_variant": variant,
            **_json_safe(result_data),
        },
    }


def _workflow_execute_local_tool(
    run_id: str,
    context: Dict[str, Any],
    config: Dict[str, Any],
    *,
    label: str,
    variant: str,
    current_text: str,
    on_waiting_for_input: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    on_resumed: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    execution_target = normalize_execution_target(
        config.get("execution_target")
        or context.get("metadata", {}).get("execution_target_selected")
        or context.get("metadata", {}).get("execution_target")
        or "auto"
    )
    permissions = config.get("permissions") if isinstance(config.get("permissions"), dict) else {}
    file_mount_grants = (
        permissions.get("file_mount_grants")
        if isinstance(permissions.get("file_mount_grants"), list)
        else context.get("metadata", {}).get("file_mount_grants")
    )
    if variant in {"shell", "browser", "code"} and execution_target == EXECUTION_TARGET_CLOUD:
        raise RuntimeError(f"{variant.title()} tool nodes cannot target cloud directly; use local_companion or auto.")
    if variant in {"shell", "code"}:
        has_command = bool(str(config.get("command") or "").strip())
        has_argv = isinstance(config.get("argv"), list) and any(str(item or "").strip() for item in (config.get("argv") or []))
        has_capability = bool(str(config.get("capability") or "").strip())
        if has_capability and (has_command or has_argv):
            raise RuntimeError(f"{variant.title()} tool nodes cannot mix capability with command or argv.")
    if variant == "code":
        has_command = bool(str(config.get("command") or "").strip())
        has_argv = isinstance(config.get("argv"), list) and any(str(item or "").strip() for item in (config.get("argv") or []))
        has_capability = bool(str(config.get("capability") or "").strip())
        if has_command or has_argv or has_capability:
            raise RuntimeError("Code tool nodes cannot use command, argv, or capability in the current runtime.")
        raise RuntimeError(
            "Code tool nodes are not executable in local companion V1; they require a reviewed higher-trust execution path."
        )
    if variant == "file":
        file_access = assert_file_mount_access(
            config.get("path") or config.get("file_path"),
            config.get("mode") or config.get("operation") or "read",
            file_mount_grants,
            execution_target,
        )
        operation = {
            "tool": "read_write_files",
            "mode": file_access["mode"],
            "path": str(config.get("path") or config.get("file_path") or "").strip(),
            "content": str(config.get("content") or current_text or ""),
            "overwrite": bool(config.get("overwrite")),
            "file_mount_grants": file_mount_grants if isinstance(file_mount_grants, list) else [],
            "mount": file_access["mount"],
        }
        if not operation["path"]:
            raise RuntimeError("File tool node requires path or file_path.")
    elif variant == "shell":
        cwd_access = assert_file_mount_access(
            config.get("cwd") or ".",
            "read",
            file_mount_grants,
            execution_target,
        )
        operation = {
            "tool": "execute_shell_command",
            "command": str(config.get("command") or "").strip() or None,
            "argv": list(config.get("argv") or []) if isinstance(config.get("argv"), list) else None,
            "cwd": str(config.get("cwd") or ".").strip() or ".",
            "timeout_seconds": int(config.get("timeout_seconds") or 60),
            "capability": str(config.get("capability") or "").strip() or None,
            "file_mount_grants": file_mount_grants if isinstance(file_mount_grants, list) else [],
            "cwd_mount": cwd_access["mount"],
        }
        if not operation["command"] and not operation["argv"]:
            raise RuntimeError(f"{variant.title()} tool nodes require command or argv in the current runtime.")
    elif variant == "browser":
        browser_path = str(config.get("path") or "").strip()
        browser_path_mount: Optional[Dict[str, str]] = None
        if browser_path:
            browser_path_mount = assert_file_mount_access(
                browser_path,
                "write",
                file_mount_grants,
                execution_target,
            )
        browser_permissions = permissions.get("browser_permissions") if isinstance(permissions.get("browser_permissions"), dict) else {}
        browser_actions = config.get("browser_actions") if isinstance(config.get("browser_actions"), list) else None
        session_profile = str(config.get("session_profile") or "").strip()
        if (session_profile or browser_actions) and not bool(browser_permissions.get("allow")):
            raise RuntimeError("Browser tool nodes with session_profile or browser_actions require browser_permissions.allow = true.")
        normalized_browser_actions = [
            normalize_action_id(item.get("action"))
            for item in (browser_actions or [])
            if isinstance(item, dict) and normalize_action_id(item.get("action"))
        ]
        interactive_actions = [action for action in normalized_browser_actions if action in _BROWSER_AUTH_ACTIONS]
        if session_profile and interactive_actions:
            raise RuntimeError(
                "Session-backed interactive or privileged browser automation is not executable in local companion V1 without a reviewed higher-trust path."
            )
        operation = {
            "tool": "browser_automation",
            "mode": str(config.get("mode") or "extract_text").strip() or "extract_text",
            "url": str(config.get("url") or "").strip(),
            "path": browser_path or None,
            "session_profile": session_profile or None,
            "browser_actions": browser_actions,
            "file_mount_grants": file_mount_grants if isinstance(file_mount_grants, list) else [],
            "path_mount": browser_path_mount["mount"] if browser_path_mount else None,
            "browser_permissions": browser_permissions if isinstance(browser_permissions, dict) else {"allow": False},
        }
        if not operation["url"]:
            raise RuntimeError("Browser tool node requires a URL.")
    else:
        raise RuntimeError(f"Local tool variant '{variant}' is not supported.")

    operation = {key: value for key, value in operation.items() if value is not None}
    child_run_id = _workflow_tool_create_child_local_run(
        run_id,
        context,
        label=label,
        operation=operation,
        summary=str(config.get("summary") or f"Execute {variant} tool node {label}").strip(),
    )
    child_run = _workflow_wait_for_child_run(
        child_run_id,
        timeout_seconds=int(config.get("timeout_seconds") or 300),
        on_waiting_for_input=on_waiting_for_input,
        on_resumed=on_resumed,
    )
    result_text = _workflow_text_payload(child_run.get("result") or "")
    result_data = child_run.get("result_data") if isinstance(child_run.get("result_data"), dict) else {}
    return {
        "summary": result_text or f"Local tool node completed: {label}",
        "result_data": {
            "local_child_run_id": child_run_id,
            "tool_variant": variant,
            "child_result": _json_safe(result_data),
        },
    }


def _workflow_final_result_data(
    workflow_definition: Dict[str, Any],
    *,
    final_node_id: Optional[str],
    final_text: str,
    final_data: Optional[Dict[str, Any]],
    run_id: str,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "summary": final_text,
        "workflow_execution": {
            "schema_version": str(workflow_definition.get("version") or "").strip() or None,
            "node_count": len(workflow_definition.get("nodes") or []),
            "edge_count": len(workflow_definition.get("edges") or []),
            "final_node_id": final_node_id,
            "run_id": run_id,
        },
    }
    if isinstance(final_data, dict) and final_data:
        result["last_node_data"] = _json_safe(final_data)
    return result


def _execute_workflow_graph(
    run_id: str,
    context: Dict[str, Any],
    log_queue: queue.Queue,
    workflow_definition: Dict[str, Any],
) -> Dict[str, Any]:
    nodes = workflow_definition.get("nodes") if isinstance(workflow_definition.get("nodes"), list) else []
    edges = workflow_definition.get("edges") if isinstance(workflow_definition.get("edges"), list) else []
    if not nodes:
        raise RuntimeError("Workflow definition has no nodes.")

    node_map: Dict[str, Dict[str, Any]] = {
        str(node.get("id") or "").strip(): node
        for node in nodes
        if isinstance(node, dict) and str(node.get("id") or "").strip()
    }
    if not node_map:
        raise RuntimeError("Workflow definition has no usable node ids.")
    _ensure_run_node_states(run_id, graph_kind="workflow", nodes=nodes)

    trigger_nodes = [
        node for node in nodes if isinstance(node, dict) and str(node.get("type") or "").strip().lower() == "trigger"
    ]
    current_node = None
    if trigger_nodes:
        non_manual = [node for node in trigger_nodes if str(node.get("variant") or "").strip().lower() != "manual"]
        current_node = (non_manual or trigger_nodes)[0]
    else:
        current_node = nodes[0] if isinstance(nodes[0], dict) else None

    current_text = (
        _workflow_text_payload(context.get("business_plan"))
        or _workflow_text_payload(context.get("user_goal"))
        or "Workflow run started."
    )
    state: Dict[str, Any] = {
        "last_text": current_text,
        "last_data": None,
        "active_provider": str(context.get("provider") or "openai").strip() or "openai",
        "active_model": str(context.get("model") or CODEX_MODEL).strip() or CODEX_MODEL,
    }
    final_node_id: Optional[str] = None
    safety_counter = 0

    while current_node and safety_counter < 100:
        safety_counter += 1
        node_id = str(current_node.get("id") or "").strip()
        node_type = str(current_node.get("type") or "").strip().lower()
        variant = str(current_node.get("variant") or "").strip().lower()
        config = current_node.get("config") if isinstance(current_node.get("config"), dict) else {}
        label = _workflow_label(current_node)
        final_node_id = node_id or final_node_id
        _update_run_node_state(
            run_id,
            node_id,
            status="running",
            activate=True,
            label=label,
            node_type=node_type,
            variant=variant,
            input_preview=_node_preview_text(current_text),
            summary=f"Executing {label}",
            reset_started=True,
        )
        emit_log(log_queue, "info", f"Workflow node: {label}", event="workflow_node_start", data={"node_id": node_id, "type": node_type, "variant": variant})

        next_handle: Optional[str] = None
        try:
            if node_type == "trigger":
                emit_log(log_queue, "info", f"Trigger active: {label}", event="workflow_trigger", data={"variant": variant or "manual", "node_id": node_id})
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=_node_preview_text(current_text),
                    summary=f"Trigger active: {variant or 'manual'}",
                    detail={"node_id": node_id, "variant": variant or "manual"},
                )

            elif node_type == "agent":
                execution_context, agent_state = _resolve_agent_generation_state(context, config)
                system_prompt = _build_workflow_agent_system_prompt(config)
                user_input = (
                    f"Workflow context:\n{current_text or 'No previous node output.'}\n\n"
                    f"Current workflow node: {label}\n"
                    "Produce the result for this node only."
                )
                text = generate_with_candidate_failover(agent_state, execution_context, log_queue, system_prompt, user_input)
                current_text = text
                state["last_text"] = text
                state["last_data"] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "variant": variant,
                    "text": text,
                }
                state["active_provider"] = str(agent_state.get("active_provider") or agent_state.get("provider") or state.get("active_provider") or "openai")
                state["active_model"] = str(agent_state.get("active_model") or agent_state.get("selected_model") or state.get("active_model") or CODEX_MODEL)
                emit_log(log_queue, "info", text, event="workflow_agent_output", data={"node_id": node_id})
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=_node_preview_text(text),
                    summary=f"Agent completed: {label}",
                    detail={
                        "provider": state.get("active_provider"),
                        "model": state.get("active_model"),
                    },
                )

            elif node_type == "decision":
                expression = str(config.get("expression") or "").strip() or "False"
                try:
                    decision = _workflow_decision_value(current_text, state, expression)
                except Exception as exc:
                    raise RuntimeError(f"Decision node '{label}' failed to evaluate expression: {exc}") from exc
                next_handle = "true" if decision else "false"
                state["last_data"] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "variant": variant,
                    "decision": bool(decision),
                    "expression": expression,
                }
                current_text = f"{label}: {'true' if decision else 'false'}"
                state["last_text"] = current_text
                emit_log(log_queue, "info", current_text, event="workflow_decision", data={"node_id": node_id, "decision": bool(decision), "expression": expression})
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=_node_preview_text(current_text),
                    summary=f"Decision: {'true' if decision else 'false'}",
                    detail={"decision": bool(decision), "expression": expression},
                )

            elif node_type == "human":
                title = str(config.get("title") or label or "Approval required").strip() or "Approval required"
                instructions = str(config.get("instructions") or "").strip()
                decision_options = config.get("decision_options") if isinstance(config.get("decision_options"), list) else []
                option_text = ", ".join(str(item).strip() for item in decision_options if str(item).strip()) or "approve / reject"
                if variant == "wait_for_reply":
                    prompt = (
                        f"{title}. {instructions} "
                        f"Current workflow context: {current_text or 'No current output.'} "
                        "Reply with the information needed to continue."
                    ).strip()
                elif variant == "review":
                    prompt = (
                        f"{title}. {instructions} "
                        f"Current workflow context: {current_text or 'No current output.'} "
                        f"Reply with feedback or choose one of: {option_text}."
                    ).strip()
                else:
                    prompt = (
                        f"{title}. {instructions} "
                        f"Current workflow context: {current_text or 'No current output.'} "
                        f"Reply with one of: {option_text}."
                    ).strip()
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="waiting_human",
                    summary=title,
                    detail={"variant": variant or "approval", "decision_options": decision_options},
                    waiting_for_approval=True,
                )
                human_response = wait_for_human_response(
                    run_id,
                    prompt,
                    source="workflow_human_node",
                    metadata={
                        "node_id": node_id,
                        "node_label": label,
                        "variant": variant or "approval",
                        "decision_options": decision_options,
                    },
                )
                response_decision = str(human_response.get("decision") or "").strip().lower()
                response_raw_decision = str(human_response.get("raw_decision") or "").strip()
                response_note = str(human_response.get("note") or "").strip()
                if variant == "approval":
                    if not bool(human_response.get("approved")):
                        raise RuntimeError(f"Workflow stopped at human node '{label}'.")
                    current_text = f"{title}: approved"
                    summary_text = f"{title}: approved"
                    output_preview = _node_preview_text(current_text)
                else:
                    reply_text = response_note or response_raw_decision or response_decision
                    if not reply_text:
                        raise RuntimeError(f"Human node '{label}' did not receive a usable response.")
                    current_text = reply_text
                    summary_text = (
                        f"Reply received: {title}"
                        if variant == "wait_for_reply"
                        else f"Review received: {title}"
                    )
                    output_preview = _node_preview_text(reply_text)
                state["last_text"] = current_text
                state["last_data"] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "variant": variant,
                    "decision": response_decision or None,
                    "raw_decision": response_raw_decision or None,
                    "note": response_note or None,
                    "human_response": _json_safe(human_response),
                }
                emit_log(
                    log_queue,
                    "info",
                    current_text,
                    event="workflow_human_resolved",
                    data={"node_id": node_id, "variant": variant or "approval", "decision": response_decision or None},
                )
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=output_preview,
                    summary=summary_text,
                    detail={
                        "decision": response_decision or None,
                        "note": response_note or None,
                        "variant": variant or "approval",
                        "decision_options": decision_options,
                    },
                    waiting_for_approval=False,
                )

            elif node_type == "data":
                template = str(config.get("template") or "").strip()
                mapping = str(config.get("mapping") or "").strip()
                summary = template or mapping or label
                current_text = summary if not current_text else f"{summary}\n\n{current_text}"
                state["last_text"] = current_text
                state["last_data"] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "variant": variant,
                    "summary": summary,
                }
                emit_log(log_queue, "info", f"Data step: {summary}", event="workflow_data_step", data={"node_id": node_id, "variant": variant})
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=_node_preview_text(current_text),
                    summary=summary,
                    detail={"variant": variant or "transform"},
                )

            elif node_type == "subflow":
                child_workflow_id = str(config.get("workflow_id") or "").strip()
                if not child_workflow_id:
                    raise RuntimeError(f"Subflow node '{label}' is missing workflow_id.")
                if child_workflow_id == str(context.get("workflow_id") or "").strip():
                    raise RuntimeError("Recursive subflow calls are not allowed.")
                from server_modules.runtime_models import RunStartRequest
                from server_modules.runs_delegation import _create_run_from_request as _create_child_run

                child_metadata = dict(context.get("metadata") if isinstance(context.get("metadata"), dict) else {})
                child_metadata["subflow_parent_run_id"] = run_id
                child_metadata["subflow_parent_workflow_id"] = str(context.get("workflow_id") or "").strip() or None
                child_req = RunStartRequest(
                    engine=str(context.get("engine") or "orion"),
                    workflow_id=child_workflow_id,
                    workspace_id=context.get("workspace_id"),
                    user_goal=current_text or context.get("user_goal"),
                    business_plan=current_text or context.get("business_plan"),
                    agent_role=context.get("agent_role"),
                    provider=context.get("provider"),
                    model=context.get("model"),
                    credential_id=context.get("credential_id"),
                    parent_run_id=run_id,
                    metadata=child_metadata,
                )
                child_result = _create_child_run(child_req)
                route = child_result.get("route") if isinstance(child_result.get("route"), dict) else {}
                if str(route.get("selected") or "").strip().lower() == EXECUTION_TARGET_LOCAL_COMPANION:
                    raise RuntimeError("Synchronous subflow execution does not yet support local_companion routing.")
                child_run_id = str(child_result.get("run_id") or "").strip()
                if not child_run_id:
                    raise RuntimeError("Subflow execution did not return a child run id.")
                emit_log(log_queue, "info", f"Subflow started: {child_workflow_id}", event="workflow_subflow_start", data={"node_id": node_id, "child_run_id": child_run_id, "workflow_id": child_workflow_id})
                _update_run_node_state(
                    run_id,
                    node_id,
                    summary=f"Waiting for subflow {child_workflow_id}",
                    detail={"mode": str(config.get("mode") or "sync").strip() or "sync"},
                    child_run_id=child_run_id,
                    child_workflow_id=child_workflow_id,
                )
                child_timeout = max(30, int(config.get("timeout_seconds") or 300))
                child_run = _workflow_wait_for_child_run(
                    child_run_id,
                    timeout_seconds=child_timeout,
                    on_waiting_for_input=lambda active_child_run_id, child_run: _update_run_node_state(
                        run_id,
                        node_id,
                        status="waiting_human",
                        summary=f"Subflow waiting for input: {child_workflow_id}",
                        detail={
                            "mode": str(config.get("mode") or "sync").strip() or "sync",
                            "child_status": "waiting_for_input",
                            "child_pending_approval_id": str(
                                ((child_run.get("pending_approval") or {}) if isinstance(child_run, dict) else {}).get("approval_id") or ""
                            ).strip() or None,
                        },
                        child_run_id=active_child_run_id,
                        child_workflow_id=child_workflow_id,
                        waiting_for_approval=True,
                    ),
                    on_resumed=lambda active_child_run_id, _child_run: _update_run_node_state(
                        run_id,
                        node_id,
                        status="running",
                        activate=True,
                        summary=f"Subflow resumed: {child_workflow_id}",
                        child_run_id=active_child_run_id,
                        child_workflow_id=child_workflow_id,
                        waiting_for_approval=False,
                    ),
                )
                child_status = str(child_run.get("status") or "").strip().lower()
                child_result_text = _workflow_text_payload(child_run.get("result") or "")
                child_result_data = child_run.get("result_data") if isinstance(child_run.get("result_data"), dict) else {}
                current_text = child_result_text or current_text
                state["last_text"] = current_text
                state["last_data"] = {
                    "node_id": node_id,
                    "node_type": node_type,
                    "variant": variant,
                    "child_run_id": child_run_id,
                    "child_workflow_id": child_workflow_id,
                    "child_status": child_status,
                    "child_result_data": child_result_data,
                }
                emit_log(log_queue, "info", f"Subflow completed: {child_workflow_id}", event="workflow_subflow_complete", data={"node_id": node_id, "child_run_id": child_run_id})
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="succeeded",
                    finalize=True,
                    output_preview=_node_preview_text(current_text),
                    summary=f"Subflow completed: {child_workflow_id}",
                    detail={"child_status": child_status},
                    child_run_id=child_run_id,
                    child_workflow_id=child_workflow_id,
                )

            elif node_type == "tool":
                execution_target = str(
                    config.get("execution_target")
                    or context.get("metadata", {}).get("execution_target_selected")
                    or context.get("metadata", {}).get("execution_target")
                    or "auto"
                ).strip() or "auto"
                normalized_execution_target = normalize_execution_target(execution_target)
                if variant in {"shell", "browser", "code"} and normalized_execution_target == EXECUTION_TARGET_CLOUD:
                    raise RuntimeError(f"{variant.title()} tool nodes cannot target cloud directly; use local_companion or auto.")
                permissions = config.get("permissions") if isinstance(config.get("permissions"), dict) else {}
                policy_metadata = map_builder_permissions_to_runtime_metadata(permissions, execution_target=execution_target)
                if variant == "browser":
                    browser_policy = _browser_automation_policy_from_operations(
                        [
                            {
                                "mode": config.get("mode"),
                                "session_profile": config.get("session_profile"),
                                "browser_actions": config.get("browser_actions"),
                            }
                        ]
                    )
                    if browser_policy:
                        policy_metadata["browser_automation_policy"] = browser_policy
                capability_ids = []
                if str(config.get("capability") or "").strip():
                    capability_ids = [str(config.get("capability") or "").strip()]
                tool_id = _workflow_tool_policy_tool_id(variant, config)
                if tool_id:
                    evaluation = evaluate_tool_policy_decision(
                        tool_id=tool_id,
                        trust_mode=str(policy_metadata.get("trust_mode") or "guarded"),
                        target=str(policy_metadata.get("execution_target") or execution_target or "auto"),
                        metadata=policy_metadata,
                        capability_ids=capability_ids,
                    )
                    _append_run_tool_policy_audit(
                        run_id,
                        evaluation,
                        source="workflow_tool_node",
                        metadata={"node_id": node_id, "variant": variant},
                    )
                    decision = str(evaluation.get("decision") or "").strip().lower()
                    if decision == "blocked":
                        raise RuntimeError(f"Tool node '{label}' is blocked by runtime policy.")
                    if decision == "approval_required":
                        _update_run_node_state(
                            run_id,
                            node_id,
                            status="waiting_human",
                            summary=f"Approval required before {label}",
                            detail={"tool_id": tool_id, "variant": variant, "evaluation": evaluation},
                            waiting_for_approval=True,
                        )
                        approved = wait_for_human_decision(
                            run_id,
                            f"Tool node '{label}' requires approval before execution. Reply with Proceed to continue or Hold to stop.",
                        )
                        if not approved:
                            raise RuntimeError(f"Workflow stopped before tool node '{label}'.")
                        _update_run_node_state(
                            run_id,
                            node_id,
                            status="running",
                            activate=True,
                            summary=f"Executing approved tool: {label}",
                            waiting_for_approval=False,
                        )

                if variant == "http":
                    method = str(config.get("method") or "GET").strip().upper() or "GET"
                    url = str(config.get("url") or "").strip()
                    if not url:
                        raise RuntimeError(f"HTTP tool node '{label}' requires a URL.")
                    assert_safe_outbound_url(url)
                    payload = None if method == "GET" else {"context": current_text}
                    response = http_json_request(url, method=method, payload=payload, timeout=30)
                    if int(response.get("status") or 500) >= 400:
                        raise RuntimeError(f"HTTP tool node '{label}' failed with status {int(response.get('status') or 500)}.")
                    tool_output = response.get("json") if response.get("json") is not None else response.get("text")
                    current_text = _workflow_text_payload(tool_output)
                    state["last_text"] = current_text
                    state["last_data"] = {
                        "node_id": node_id,
                        "node_type": node_type,
                        "variant": variant,
                        "tool_id": tool_id or "http",
                        "output": _json_safe(tool_output),
                    }
                    emit_log(log_queue, "info", f"HTTP tool completed: {label}", event="workflow_tool_http", data={"node_id": node_id, "url": url, "method": method})
                    _update_run_node_state(
                        run_id,
                        node_id,
                        status="succeeded",
                        finalize=True,
                        output_preview=_node_preview_text(current_text),
                        summary=f"HTTP tool completed: {label}",
                        detail={"tool_id": tool_id or "http", "url": url, "method": method},
                    )
                elif variant == "connector_action":
                    tool_result = _workflow_execute_connector_action(
                        context,
                        config,
                        current_text=current_text,
                    )
                    current_text = _workflow_text_payload(tool_result.get("summary") or current_text)
                    state["last_text"] = current_text
                    state["last_data"] = {
                        "node_id": node_id,
                        "node_type": node_type,
                        "variant": variant,
                        "tool_id": tool_id or "connector_action",
                        **(_json_safe(tool_result.get("result_data")) if isinstance(tool_result.get("result_data"), dict) else {}),
                    }
                    emit_log(log_queue, "info", current_text, event="workflow_tool_connector_action", data={"node_id": node_id, "tool_id": tool_id})
                    _update_run_node_state(
                        run_id,
                        node_id,
                        status="succeeded",
                        finalize=True,
                        output_preview=_node_preview_text(current_text),
                        summary=f"Connector action completed: {label}",
                        detail={"tool_id": tool_id or "connector_action", "result": tool_result.get("result_data")},
                    )
                elif variant in {"document", "spreadsheet"}:
                    tool_result = _workflow_execute_document_or_spreadsheet_tool(
                        context,
                        config,
                        variant=variant,
                    )
                    current_text = _workflow_text_payload(tool_result.get("summary") or current_text)
                    state["last_text"] = current_text
                    state["last_data"] = {
                        "node_id": node_id,
                        "node_type": node_type,
                        "variant": variant,
                        "tool_id": tool_id or variant,
                        **(_json_safe(tool_result.get("result_data")) if isinstance(tool_result.get("result_data"), dict) else {}),
                    }
                    emit_log(log_queue, "info", current_text, event=f"workflow_tool_{variant}", data={"node_id": node_id, "tool_id": tool_id})
                    _update_run_node_state(
                        run_id,
                        node_id,
                        status="succeeded",
                        finalize=True,
                        output_preview=_node_preview_text(current_text),
                        summary=f"{variant.title()} tool completed: {label}",
                        detail={"tool_id": tool_id or variant, "result": tool_result.get("result_data")},
                    )
                elif variant in {"file", "shell", "browser", "code"}:
                    tool_result = _workflow_execute_local_tool(
                        run_id,
                        context,
                        config,
                        label=label,
                        variant=variant,
                        current_text=current_text,
                        on_waiting_for_input=lambda active_child_run_id, child_run: _update_run_node_state(
                            run_id,
                            node_id,
                            status="waiting_human",
                            summary=f"Local tool waiting for input: {label}",
                            detail={
                                "tool_id": tool_id or variant,
                                "variant": variant,
                                "child_status": "waiting_for_input",
                                "child_pending_approval_id": str(
                                    ((child_run.get("pending_approval") or {}) if isinstance(child_run, dict) else {}).get("approval_id") or ""
                                ).strip() or None,
                            },
                            child_run_id=active_child_run_id,
                            waiting_for_approval=True,
                        ),
                        on_resumed=lambda active_child_run_id, _child_run: _update_run_node_state(
                            run_id,
                            node_id,
                            status="running",
                            activate=True,
                            summary=f"Local tool resumed: {label}",
                            child_run_id=active_child_run_id,
                            waiting_for_approval=False,
                        ),
                    )
                    current_text = _workflow_text_payload(tool_result.get("summary") or current_text)
                    state["last_text"] = current_text
                    state["last_data"] = {
                        "node_id": node_id,
                        "node_type": node_type,
                        "variant": variant,
                        "tool_id": tool_id or variant,
                        **(_json_safe(tool_result.get("result_data")) if isinstance(tool_result.get("result_data"), dict) else {}),
                    }
                    emit_log(log_queue, "info", current_text, event=f"workflow_tool_{variant}", data={"node_id": node_id, "tool_id": tool_id})
                    _update_run_node_state(
                        run_id,
                        node_id,
                        status="succeeded",
                        finalize=True,
                        output_preview=_node_preview_text(current_text),
                        summary=f"{variant.title()} tool completed: {label}",
                        detail={"tool_id": tool_id or variant, "result": tool_result.get("result_data")},
                    )
                else:
                    raise RuntimeError(f"Tool variant '{variant or 'unknown'}' is not executable in the Orion graph runtime yet.")

            else:
                raise RuntimeError(f"Unsupported workflow node type '{node_type}'.")
        except Exception as exc:
            _update_run_node_state(
                run_id,
                node_id,
                status="failed",
                finalize=True,
                error=_node_preview_text(friendly_runtime_error_message(exc), limit=400),
                summary=f"Failed: {label}",
                detail={"node_id": node_id, "type": node_type, "variant": variant},
                waiting_for_approval=False,
            )
            raise

        next_node_id = _workflow_next_node_id(edges, node_id, preferred_handle=next_handle)
        current_node = node_map.get(next_node_id) if next_node_id else None

    if safety_counter >= 100:
        raise RuntimeError("Workflow graph exceeded the maximum node execution limit.")

    final_text = state.get("last_text") if isinstance(state.get("last_text"), str) else current_text
    final_data = state.get("last_data") if isinstance(state.get("last_data"), dict) else None
    usage = build_masked_usage(
        str(state.get("active_provider") or context.get("provider") or "openai"),
        str(state.get("active_model") or context.get("model") or CODEX_MODEL),
        f"{_workflow_text_payload(context.get('user_goal'))}\n\n{_workflow_text_payload(context.get('business_plan'))}",
        final_text,
    )
    return {
        "result_text": final_text,
        "result_data": _workflow_final_result_data(
            workflow_definition,
            final_node_id=final_node_id,
            final_text=final_text,
            final_data=final_data,
            run_id=run_id,
        ),
        "usage_masked": usage,
        "active_profile_id": None,
        "active_provider": str(state.get("active_provider") or context.get("provider") or "openai"),
        "active_model": str(state.get("active_model") or context.get("model") or CODEX_MODEL),
        "active_adapter": None,
    }

def _compile_orion_dag(context: Dict[str, Any]) -> Dict[str, Any]:
    workflow_definition = _workflow_definition_from_context(context)
    if isinstance(workflow_definition, dict) and isinstance(workflow_definition.get("nodes"), list) and workflow_definition.get("nodes"):
        return {
            "id": str(context.get("workflow_id") or "workflow-graph"),
            "type": "workflow_graph",
            "workflow_id": context.get("workflow_id"),
            "graph_node_count": len(workflow_definition.get("nodes") or []),
            "nodes": [
                {"id": "workflow.graph", "kind": "workflow_graph_execute", "deps": []},
            ],
        }

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

    if kind == "workflow_graph_execute":
        workflow_definition = _workflow_definition_from_context(context)
        if not isinstance(workflow_definition, dict):
            raise RuntimeError("Workflow graph execution requested without a workflow definition.")
        result = _execute_workflow_graph(run_id, context, log_queue, workflow_definition)
        emit_log(
            log_queue,
            "info",
            "Workflow graph completed.",
            event="workflow_graph_complete",
            data={
                "workflow_id": context.get("workflow_id"),
                "node_count": len(workflow_definition.get("nodes") or []),
            },
        )
        state["final_result_text"] = result["result_text"]
        state["final_result_data"] = result.get("result_data")
        state["final_usage"] = result["usage_masked"]
        state["active_profile_id"] = result.get("active_profile_id")
        state["active_provider"] = result.get("active_provider")
        state["active_model"] = result.get("active_model")
        state["active_adapter"] = result.get("active_adapter")
        return {"done": True}

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
    if str(dag_spec.get("type") or "").strip().lower() != "workflow_graph":
        _ensure_run_node_states(run_id, graph_kind="dag", nodes=ordered_nodes)
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
        if str(dag_spec.get("type") or "").strip().lower() != "workflow_graph":
            _update_run_node_state(
                run_id,
                node_id,
                status="running",
                activate=True,
                label=str(node.get("label") or node_id).strip() or node_id,
                node_type="dag",
                variant=str(node.get("kind") or "").strip().lower(),
                input_preview=_node_preview_text({"deps": deps, "completed": sorted(completed)}),
                summary=f"Executing DAG node {node_id}",
                reset_started=True,
            )
        emit_log(log_queue, "info", f"Node started: {node_id}", event="dag_node_start", data={"node_id": node_id})
        try:
            node_output = _execute_orion_dag_node(run_id, context, log_queue, node, state)
        except Exception as exc:
            if str(dag_spec.get("type") or "").strip().lower() != "workflow_graph":
                _update_run_node_state(
                    run_id,
                    node_id,
                    status="failed",
                    finalize=True,
                    error=_node_preview_text(friendly_runtime_error_message(exc), limit=400),
                    summary=f"Failed: {node_id}",
                    detail={"kind": node.get("kind")},
                )
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
        if str(dag_spec.get("type") or "").strip().lower() != "workflow_graph":
            node_status = "skipped" if isinstance(node_output, dict) and bool(node_output.get("skipped")) else "succeeded"
            _update_run_node_state(
                run_id,
                node_id,
                status=node_status,
                finalize=True,
                output_preview=_node_preview_text(node_output),
                summary=(f"Skipped: {node_id}" if node_status == "skipped" else f"Completed: {node_id}"),
                detail={"kind": node.get("kind"), "result": node_output},
            )
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
        "active_profile_id": state.get("active_profile_id"),
        "active_provider": state.get("active_provider") or state.get("provider"),
        "active_model": state.get("active_model") or state.get("selected_model"),
        "active_adapter": state.get("active_adapter"),
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
            run["active_profile_id"] = result.get("active_profile_id")
            run["active_provider"] = result.get("active_provider")
            run["active_model"] = result.get("active_model")
            run["active_adapter"] = result.get("active_adapter")
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
