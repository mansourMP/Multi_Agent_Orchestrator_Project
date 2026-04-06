from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import queue
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
import uuid

from fastapi import HTTPException

from server_modules.agent_turn import AgentTurnRequest, bind_agent_turn_metadata, resolve_run_start_turn_request
from server_modules.doctor_gate import build_doctor_run_gate_live
from server_modules import machine_lease_service
from server_modules.policy_service import apply_execution_route_metadata, decide_execution_target
from server_modules.runtime_models import RunStartRequest


RUN_STATES = (
    "queued",
    "planning",
    "waiting_approval",
    "machine_allocating",
    "executing",
    "blocked",
    "retrying",
    "completed",
    "failed",
    "canceled",
)

ROUTING_PROVIDER_ORDER: Tuple[str, ...] = ("openai", "anthropic", "gemini", "codex_cli", "ollama")
APPROVAL_SCOPE_ONCE = "once"
APPROVAL_SCOPE_CONSEQUENCE = "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."
APPROVAL_APPROVE_TOKENS = {"proceed", "approve", "yes", "y", "continue", "ok"}
APPROVAL_REJECT_TOKENS = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
APPROVAL_ESCALATE_TOKENS = {"escalate", "escalated"}


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


def resolve_fastest_routing_context(
    *,
    routing_provider_order: Tuple[str, ...],
    provider_has_key_fn: Callable[[str], bool],
    resolve_requested_model_fn: Callable[[Dict[str, Any], Dict[str, Any], str], Any],
) -> Optional[Dict[str, str]]:
    for provider in routing_provider_order:
        if not provider_has_key_fn(provider):
            continue
        model = str(
            resolve_requested_model_fn({"provider": provider}, {"provider": provider}, provider)
        ).strip() or None
        return {"provider": provider, "model": model or ""}
    return None


@dataclass(slots=True)
class RunRecord:
    run_id: str
    tenant_id: str
    workspace_id: str
    state: str = "queued"
    session_id: str = ""
    machine_target: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RunTransition:
    run_id: str
    from_state: str
    to_state: str
    reason: str = ""
    actor_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RunExecutionServices:
    stamp_request_owner: Any
    prepare_run_start_request: Any
    create_run_from_request: Any


@dataclass(slots=True)
class RunRoutingPreviewServices:
    prepare_run_start_request: Any
    compute_tool_policy_precheck: Any


@dataclass(slots=True)
class RunCreationServices:
    create_run_from_request: Any


@dataclass(slots=True)
class RunPreparedResultServices:
    create_run_from_prepared_request: Any
    build_result: Any


@dataclass(slots=True)
class LegacyRunRequestServices:
    prepare_run_start_request: Any
    build_creation_services: Any
    result_services: RunPreparedResultServices


@dataclass(slots=True)
class LegacyRunPreparationServices:
    build_preparation_services: Any


@dataclass(slots=True)
class LegacyRunExecutionCallbacks:
    stamp_request_owner: Any
    prepare_run_start_request: Any
    create_run_from_request: Any


@dataclass(slots=True)
class LegacyLocalExecutionCreationCallbacks:
    decide_execution_target: Any
    apply_execution_route_metadata: Any
    build_doctor_run_gate: Any
    agent_machine_inherited_owner_user_id: Any
    compute_tool_policy_precheck: Any
    resolve_runtime_policy_mode: Any
    agent_machine_full_trust_enabled: Any
    begin_run_pending_confirmation: Any
    create_run: Any
    local_execution_target: str
    local_execution_pack_id: str
    load_created_run: Any = None
    now_iso: Any = None


@dataclass(slots=True)
class LegacyOrionPreparationCallbacks:
    engine_registry: Any
    engine_validation_errors: Any
    supported_outcome_packs: Any
    normalize_requested_max_iterations: Callable[[Any], Optional[int]]
    normalize_trust_mode: Callable[[str], str]
    trust_mode_aliases: Any
    valid_trust_modes: Any
    normalize_execution_target: Callable[[Any], str]
    valid_execution_targets: Any
    normalize_run_id_token: Callable[[Any], Optional[str]]
    normalize_agent_role: Callable[[Any], str]
    detect_agent_role: Callable[[RunStartRequest, Dict[str, Any]], tuple[str, str]]
    resolve_app_permissions: Callable[[str], Any]
    action_policy_from_app_permissions: Callable[[Any], Dict[str, Any]]
    merge_action_policies: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    fetch_workflow_snapshot: Callable[[Any], Any]
    postprocess_metadata: Optional[Callable[[RunStartRequest, Dict[str, Any]], Dict[str, Any]]] = None


@dataclass(slots=True)
class RunPreparationServices:
    engine_registry: Any
    engine_validation_errors: Any
    supported_outcome_packs: Any
    normalize_requested_max_iterations: Callable[[Any], Optional[int]]
    normalize_trust_mode: Callable[[str], str]
    trust_mode_aliases: Any
    valid_trust_modes: Any
    normalize_execution_target: Callable[[Any], str]
    valid_execution_targets: Any
    normalize_run_id_token: Callable[[Any], Optional[str]]
    normalize_agent_role: Callable[[Any], str]
    detect_agent_role: Callable[[RunStartRequest, Dict[str, Any]], tuple[str, str]]
    resolve_app_permissions: Callable[[str], Any]
    action_policy_from_app_permissions: Callable[[Any], Dict[str, Any]]
    merge_action_policies: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    fetch_workflow_snapshot: Callable[[Any], Any]
    postprocess_metadata: Optional[Callable[[RunStartRequest, Dict[str, Any]], Dict[str, Any]]] = None


@dataclass(slots=True)
class PreparedRunCreationServices:
    decide_execution_target: Any
    apply_execution_route_metadata: Any
    build_doctor_run_gate: Any
    agent_machine_inherited_owner_user_id: Any
    compute_tool_policy_precheck: Any
    apply_browser_execution_metadata: Any
    local_execution_block_prompt: Any
    resolve_runtime_policy_mode: Any
    agent_machine_full_trust_enabled: Any
    local_execution_requires_start_confirmation: Any
    mark_local_execution_tools_approved: Any
    precheck_human_action_labels: Any
    local_execution_confirmation_prompt: Any
    begin_run_pending_confirmation: Any
    create_run: Any
    load_created_run: Any = None
    now_iso: Any = None


def build_live_run_record(
    *,
    run_id: str,
    engine: str,
    context: Dict[str, Any],
    now_iso: str,
    started_mono: float,
    log_queue: Any,
    input_queue: Any,
    memory_enabled: bool,
    memory_updated_at: str,
    active_profile_id: Optional[str],
    active_profile_label: Optional[str],
    active_provider: Optional[str],
    active_model: Optional[str],
) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "status": "starting",
        "logs": log_queue,
        "input_queue": input_queue,
        "thread_id": None,
        "engine": engine,
        "context": context,
        "created_at": now_iso,
        "updated_at": now_iso,
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
            "enabled": bool(memory_enabled),
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": memory_updated_at,
        },
        "active_profile_id": active_profile_id or None,
        "active_profile_label": active_profile_label or None,
        "active_provider": active_provider or None,
        "active_model": active_model or None,
        "active_adapter": None,
    }


def register_live_run(
    run_id: str,
    run: Dict[str, Any],
    *,
    runs_by_id: Dict[str, Dict[str, Any]],
    run_queue_index: Dict[int, str],
    metrics_inc_fn: Callable[[str, int], Any],
    persist_live_run_state_fn: Callable[[str, Dict[str, Any]], Any],
) -> None:
    runs_by_id[run_id] = run
    log_queue = run.get("logs")
    if log_queue is not None:
        run_queue_index[id(log_queue)] = run_id
    metrics_inc_fn("runs_started", 1)
    try:
        persist_live_run_state_fn(run_id, run)
    except Exception:
        pass


def get_pending_confirmation(run: Dict[str, Any]) -> Dict[str, Any]:
    pending = run.get("pending_confirmation")
    if isinstance(pending, dict):
        return pending
    legacy = run.get("pending_approval")
    if isinstance(legacy, dict):
        return legacy
    return {}


def set_pending_confirmation(run: Dict[str, Any], payload: Optional[Dict[str, Any]]) -> None:
    run["pending_confirmation"] = payload
    run["pending_approval"] = payload


def clear_pending_confirmation(run: Dict[str, Any]) -> None:
    run["pending_confirmation"] = None
    run["pending_approval"] = None


def begin_run_pending_confirmation(
    run_id: str,
    prompt: str,
    *,
    runs_by_id: Dict[str, Dict[str, Any]],
    default_approval_ttl_seconds: int,
    approval_correlation_id_fn: Callable[..., str],
    append_approval_audit_fn: Callable[..., Any],
    json_safe_fn: Callable[[Any], Any],
    emit_log_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    utc_now_fn: Callable[[], Any],
    utc_now_iso_fn: Callable[[], str],
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        raise RuntimeError("Run ID not found.")
    context = run.get("context")
    context_metadata = {}
    if isinstance(context, dict):
        raw_metadata = context.get("metadata")
        if isinstance(raw_metadata, dict):
            context_metadata = raw_metadata
    configured_ttl = context_metadata.get("approval_ttl_seconds") if isinstance(context_metadata, dict) else None
    ttl_seconds = default_approval_ttl_seconds
    if isinstance(configured_ttl, (int, float)):
        ttl_seconds = int(configured_ttl)
    ttl_seconds = max(30, min(1800, ttl_seconds))
    requested_at = utc_now_iso_fn()
    expires_at = (utc_now_fn() + timedelta(seconds=ttl_seconds)).isoformat().replace("+00:00", "Z")
    approval_id = str(uuid.uuid4())
    correlation_id = approval_correlation_id_fn(approval_id, run_id=run_id)
    safe_metadata = json_safe_fn(metadata if isinstance(metadata, dict) else {})
    approval_actions = [
        str(item).strip()
        for item in (safe_metadata.get("approval_actions") if isinstance(safe_metadata.get("approval_actions"), list) else [])
        if str(item).strip()
    ]
    approval_target = str(safe_metadata.get("target") or "").strip() or None
    payload = {
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "status": "waiting",
        "requested_at": requested_at,
        "expires_at": expires_at,
        "prompt": prompt,
        "ttl_seconds": ttl_seconds,
        "scope": APPROVAL_SCOPE_ONCE,
        "reusable": False,
        "consequence": APPROVAL_SCOPE_CONSEQUENCE,
        "actions": approval_actions,
        "target": approval_target,
        "metadata": safe_metadata,
    }
    set_pending_confirmation(run, payload)
    emit_log_fn(
        run["logs"],
        "warn",
        prompt,
        event="approval_requested",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            "scope": APPROVAL_SCOPE_ONCE,
            "reusable": False,
            **safe_metadata,
        },
    )
    append_approval_audit_fn(
        approval_id=approval_id,
        stage="requested",
        actor="system",
        source=source,
        run_id=run_id,
        note=prompt,
        correlation_id=correlation_id,
        metadata={
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            "scope": APPROVAL_SCOPE_ONCE,
            "reusable": False,
            **(safe_metadata if isinstance(safe_metadata, dict) else {}),
        },
    )
    emit_log_fn(
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
    append_approval_audit_fn(
        approval_id=approval_id,
        stage="waiting",
        actor="system",
        source=source,
        run_id=run_id,
        correlation_id=correlation_id,
    )
    set_run_status_fn(run_id, "waiting_for_input")
    if emit_pause_required:
        run["logs"].put("__PAUSE_REQUIRED__")
    return payload


def begin_run_pending_approval(
    run_id: str,
    prompt: str,
    *,
    begin_run_pending_confirmation_fn: Callable[..., Dict[str, Any]],
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    return begin_run_pending_confirmation_fn(
        run_id,
        prompt,
        source=source,
        metadata=metadata,
        emit_pause_required=emit_pause_required,
    )


def wait_for_human_response(
    run_id: str,
    prompt: str,
    *,
    runs_by_id: Dict[str, Dict[str, Any]],
    begin_run_pending_confirmation_fn: Callable[..., Dict[str, Any]],
    clear_pending_confirmation_fn: Callable[[Dict[str, Any]], None],
    get_pending_confirmation_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    set_pending_confirmation_fn: Callable[[Dict[str, Any], Optional[Dict[str, Any]]], None],
    approval_correlation_id_fn: Callable[..., str],
    append_approval_audit_fn: Callable[..., Any],
    emit_log_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    utc_now_iso_fn: Callable[[], str],
    approval_ttl_seconds: int,
    monotonic_fn: Callable[[], float] = time.monotonic,
    queue_empty_exception: type[BaseException] = queue.Empty,
    source: str = "runtime_wait",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    run = runs_by_id[run_id]
    existing_pending = get_pending_confirmation_fn(run)
    if isinstance(existing_pending, dict):
        existing_status = str(existing_pending.get("status") or "").strip().lower()
        existing_prompt = str(existing_pending.get("prompt") or "").strip()
        decision_raw_text = str(existing_pending.get("decision") or "").strip()
        if (
            existing_status == "resolved"
            and decision_raw_text
            and (not existing_prompt or existing_prompt == str(prompt or "").strip())
        ):
            approval_id = str(existing_pending.get("approval_id") or "").strip()
            correlation_id = str(existing_pending.get("correlation_id") or "").strip() or approval_correlation_id_fn(
                approval_id,
                run_id=run_id,
            )
            decision_text = decision_raw_text.lower()
            decision_note = str(existing_pending.get("note") or "").strip()
            approved = decision_text in APPROVAL_APPROVE_TOKENS
            rejected = decision_text in APPROVAL_REJECT_TOKENS
            escalated = decision_text in APPROVAL_ESCALATE_TOKENS
            if not approved and not rejected and not escalated:
                rejected = True
            run.pop("_resume_after_confirmation_scheduled", None)
            set_run_status_fn(run_id, "running")
            emit_log_fn(
                run["logs"],
                "info",
                f"Decision received: {decision_text}",
                event="approval_received",
                data={
                    "approval_id": approval_id,
                    "correlation_id": correlation_id,
                    "decision": decision_text,
                    "scope": "once",
                    "reusable": False,
                },
            )
            append_approval_audit_fn(
                approval_id=approval_id,
                stage="received",
                decision=decision_text,
                actor="user",
                source="runtime_wait",
                run_id=run_id,
                note=decision_note or decision_raw_text,
                correlation_id=correlation_id,
                metadata={"scope": "once", "reusable": False, "resumed_after_restart": True},
            )
            emit_log_fn(
                run["logs"],
                "info" if approved else "warn",
                "Confirmation resolved.",
                event="approval_resolved",
                data={
                    "approval_id": approval_id,
                    "correlation_id": correlation_id,
                    "decision": decision_text,
                    "approved": approved,
                    "rejected": bool(rejected),
                    "escalated": bool(escalated),
                    "scope": "once",
                    "reusable": False,
                    "resumed_after_restart": True,
                },
            )
            append_approval_audit_fn(
                approval_id=approval_id,
                stage="resolved",
                decision=("approved" if approved else "escalated" if escalated else "rejected"),
                actor="runtime",
                source="runtime_wait",
                run_id=run_id,
                correlation_id=correlation_id,
                metadata={
                    "raw_decision": decision_text,
                    "approved": bool(approved),
                    "rejected": bool(rejected),
                    "escalated": bool(escalated),
                    "scope": "once",
                    "reusable": False,
                    "resumed_after_restart": True,
                },
            )
            clear_pending_confirmation_fn(run)
            return {
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "raw_decision": decision_raw_text,
                "note": decision_note or None,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            }
    pending_payload = begin_run_pending_confirmation_fn(
        run_id,
        prompt,
        source=source,
        metadata=metadata,
        emit_pause_required=True,
    )
    approval_id = str(pending_payload.get("approval_id") or "").strip()
    correlation_id = str(pending_payload.get("correlation_id") or "").strip()
    ttl_seconds = int(pending_payload.get("ttl_seconds") or approval_ttl_seconds)
    deadline = monotonic_fn() + ttl_seconds
    while True:
        remaining = deadline - monotonic_fn()
        if remaining <= 0:
            pending = get_pending_confirmation_fn(run)
            pending["status"] = "expired"
            pending["expired_at"] = utc_now_iso_fn()
            set_pending_confirmation_fn(run, pending)
            emit_log_fn(
                run["logs"],
                "error",
                "Confirmation request expired before user decision.",
                event="approval_timeout",
                data={"approval_id": approval_id, "correlation_id": correlation_id, "ttl_seconds": ttl_seconds},
            )
            append_approval_audit_fn(
                approval_id=approval_id,
                stage="timeout",
                decision="timeout",
                actor="system",
                source="runtime_wait",
                run_id=run_id,
                note="Confirmation timeout reached while waiting for user decision.",
                correlation_id=correlation_id,
            )
            raise RuntimeError("Confirmation timeout reached while waiting for user decision.")
        try:
            decision_raw = run["input_queue"].get(timeout=remaining)
        except queue_empty_exception:
            continue

        incoming_approval_id: Optional[str] = None
        decision_raw_text = ""
        decision_text = ""
        decision_note = ""
        if isinstance(decision_raw, dict):
            incoming_approval_id = str(decision_raw.get("approval_id") or "").strip() or None
            decision_raw_text = str(decision_raw.get("decision") or "").strip()
            decision_text = decision_raw_text.lower()
            decision_note = str(decision_raw.get("note") or "").strip()
        else:
            decision_raw_text = str(decision_raw or "").strip()
            decision_text = decision_raw_text.lower()

        if incoming_approval_id and incoming_approval_id != approval_id:
            emit_log_fn(
                run["logs"],
                "warn",
                "Ignored stale confirmation resolution for different approval_id.",
                event="approval_ignored",
                data={
                    "approval_id": incoming_approval_id,
                    "expected_approval_id": approval_id,
                    "correlation_id": correlation_id,
                },
            )
            append_approval_audit_fn(
                approval_id=incoming_approval_id,
                stage="ignored",
                decision="ignored",
                actor="runtime",
                source="runtime_wait",
                run_id=run_id,
                note=f"Expected approval_id={approval_id}",
                correlation_id=correlation_id,
                metadata={"expected_approval_id": approval_id},
            )
            continue

        pending = get_pending_confirmation_fn(run)
        pending["status"] = "resolved"
        pending["resolved_at"] = utc_now_iso_fn()
        pending["decision"] = decision_text
        set_pending_confirmation_fn(run, pending)
        set_run_status_fn(run_id, "running")
        emit_log_fn(
            run["logs"],
            "info",
            f"Decision received: {decision_text}",
            event="approval_received",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "scope": "once",
                "reusable": False,
            },
        )
        append_approval_audit_fn(
            approval_id=approval_id,
            stage="received",
            decision=decision_text,
            actor="user",
            source="runtime_wait",
            run_id=run_id,
            note=decision_note or str(decision_raw),
            correlation_id=correlation_id,
            metadata={"scope": "once", "reusable": False},
        )

        approved = decision_text in APPROVAL_APPROVE_TOKENS
        rejected = decision_text in APPROVAL_REJECT_TOKENS
        escalated = decision_text in APPROVAL_ESCALATE_TOKENS
        if not approved and not rejected and not escalated:
            rejected = True
        emit_log_fn(
            run["logs"],
            "info" if approved else "warn",
            "Confirmation resolved.",
            event="approval_resolved",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "approved": approved,
                "rejected": bool(rejected),
                "escalated": bool(escalated),
                "scope": "once",
                "reusable": False,
            },
        )
        append_approval_audit_fn(
            approval_id=approval_id,
            stage="resolved",
            decision=("approved" if approved else "escalated" if escalated else "rejected"),
            actor="runtime",
            source="runtime_wait",
            run_id=run_id,
            correlation_id=correlation_id,
            metadata={
                "raw_decision": decision_text,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
                "scope": "once",
                "reusable": False,
            },
        )
        clear_pending_confirmation_fn(run)
        return {
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision": decision_text,
            "raw_decision": decision_raw_text,
            "note": decision_note or None,
            "approved": bool(approved),
            "rejected": bool(rejected),
            "escalated": bool(escalated),
        }


def activate_live_run(
    run_id: str,
    run: Dict[str, Any],
    *,
    selected_target: str,
    local_companion_target: str,
    defer_local_enqueue: bool,
    hydrate_run_memory_context_fn: Callable[[str, Dict[str, Any]], Any],
    enqueue_local_companion_run_fn: Callable[[str], Any],
    start_background_run_fn: Callable[[str], Any],
) -> str:
    if str(selected_target or "").strip().lower() == str(local_companion_target or "").strip().lower():
        try:
            hydrate_run_memory_context_fn(run_id, run)
        except Exception:
            pass
        if not defer_local_enqueue:
            enqueue_local_companion_run_fn(run_id)
        return run_id

    start_background_run_fn(run_id)
    return run_id


def transition_live_run_status(
    run_id: str,
    status: str,
    *,
    run: Optional[Dict[str, Any]],
    now_mono: float,
    now_iso: str,
    terminal_statuses: set[str],
    local_queue_lock: Any,
    local_pending_run_ids: List[str],
    local_claimed_runs: Dict[str, Any],
    archive_run_if_terminal_fn: Callable[[str, Dict[str, Any]], Any],
    remove_live_run_state_fn: Callable[[str], Any],
    sync_local_runtime_state_snapshot_fn: Callable[[], Any],
    persist_live_run_state_fn: Callable[[str, Dict[str, Any]], Any],
    run_queue_index: Dict[int, str],
    metrics_add_fn: Callable[[str, float], Any],
    metrics_inc_fn: Callable[[str, int], Any],
    parent_run_id: Optional[str] = None,
    refresh_parent_delegation_state_fn: Optional[Callable[..., Any]] = None,
) -> None:
    if not isinstance(run, dict):
        return

    previous = run.get("status")
    if previous == "waiting_for_input" and status != "waiting_for_input":
        wait_start = run.get("_hitl_wait_start_mono")
        if isinstance(wait_start, (int, float)):
            waited_ms = max(0.0, (now_mono - wait_start) * 1000.0)
            run["_hitl_wait_total_ms"] = run.get("_hitl_wait_total_ms", 0.0) + waited_ms
            metrics_add_fn("hitl_wait_sum_ms", waited_ms)
            metrics_inc_fn("hitl_wait_count", 1)
            run["_hitl_wait_start_mono"] = None

    if status == "waiting_for_input":
        run["_hitl_wait_start_mono"] = now_mono
        metrics_inc_fn("runs_waiting_for_input", 1)

    if status in {"completed", "failed", "timeout"} and run.get("_finished_mono") is None:
        run["_finished_mono"] = now_mono
        started = run.get("_started_mono")
        if isinstance(started, (int, float)):
            duration_ms = max(0.0, (now_mono - started) * 1000.0)
            run["duration_ms"] = round(duration_ms, 2)
            metrics_add_fn("run_duration_sum_ms", duration_ms)
            metrics_inc_fn("run_duration_count", 1)
        run["completed_at"] = now_iso
        if status == "completed":
            metrics_inc_fn("runs_completed", 1)
        elif status == "failed":
            metrics_inc_fn("runs_failed", 1)
        elif status == "timeout":
            metrics_inc_fn("runs_timeout", 1)

    run["status"] = status
    run["updated_at"] = now_iso
    if status in {"completed", "failed", "timeout"}:
        machine_lease_service.reconcile_machine_lease_release(
            run_id,
            local_queue_lock=local_queue_lock,
            local_pending_run_ids=local_pending_run_ids,
            local_claimed_runs=local_claimed_runs,
            sync_local_runtime_state_snapshot_fn=sync_local_runtime_state_snapshot_fn,
        )
        archive_run_if_terminal_fn(run_id, run)
        log_queue = run.get("logs")
        if log_queue is not None:
            run_queue_index.pop(id(log_queue), None)
        remove_live_run_state_fn(run_id)
    else:
        persist_live_run_state_fn(run_id, run)

    if parent_run_id and status in terminal_statuses and callable(refresh_parent_delegation_state_fn):
        refresh_parent_delegation_state_fn(parent_run_id, triggering_run_id=run_id)


def build_run_routing_preview_services(
    *,
    prepare_run_start_request: Any,
    compute_tool_policy_precheck: Any,
) -> RunRoutingPreviewServices:
    return RunRoutingPreviewServices(
        prepare_run_start_request=prepare_run_start_request,
        compute_tool_policy_precheck=compute_tool_policy_precheck,
    )


def build_server_run_routing_preview_services(
    *,
    late_server_export: Callable[[str], Any],
) -> RunRoutingPreviewServices:
    return build_run_routing_preview_services(
        prepare_run_start_request=late_server_export("_prepare_run_start_request"),
        compute_tool_policy_precheck=late_server_export("_compute_tool_policy_precheck"),
    )


def build_run_creation_services(
    *,
    create_run_from_request: Any,
) -> RunCreationServices:
    return RunCreationServices(
        create_run_from_request=create_run_from_request,
    )


def build_server_run_creation_services(
    *,
    late_server_export: Callable[[str], Any],
) -> RunCreationServices:
    return build_run_creation_services(
        create_run_from_request=late_server_export("_create_run_from_request"),
    )


def build_run_execution_services(
    *,
    stamp_request_owner: Any,
    prepare_run_start_request: Any,
    create_run_from_request: Any,
) -> RunExecutionServices:
    return RunExecutionServices(
        stamp_request_owner=stamp_request_owner,
        prepare_run_start_request=prepare_run_start_request,
        create_run_from_request=create_run_from_request,
    )


def build_server_run_execution_services(
    *,
    stamp_request_owner: Any,
    late_server_export: Callable[[str], Any],
) -> RunExecutionServices:
    return build_run_execution_services(
        stamp_request_owner=stamp_request_owner,
        prepare_run_start_request=late_server_export("_prepare_run_start_request"),
        create_run_from_request=late_server_export("_create_run_from_request"),
    )


def build_system_run_execution_services(
    *,
    prepare_run_start_request: Any,
    create_run_from_request: Any,
) -> RunExecutionServices:
    return build_run_execution_services(
        stamp_request_owner=lambda req, current_user: req,
        prepare_run_start_request=prepare_run_start_request,
        create_run_from_request=create_run_from_request,
    )


def build_system_run_execution_services_from_namespace(
    *,
    namespace: Dict[str, Any],
    prepare_run_start_request_name: str = "_prepare_run_start_request",
    create_run_from_request_name: str = "_create_run_from_request",
    prepare_run_start_request_fallback: Optional[Callable[[], Any]] = None,
    create_run_from_request_fallback: Optional[Callable[[], Any]] = None,
) -> RunExecutionServices:
    return build_system_run_execution_services(
        prepare_run_start_request=_resolve_namespace_callable(
            namespace,
            prepare_run_start_request_name,
            fallback_loader=prepare_run_start_request_fallback,
        ),
        create_run_from_request=_resolve_namespace_callable(
            namespace,
            create_run_from_request_name,
            fallback_loader=create_run_from_request_fallback,
        ),
    )


def build_server_system_run_execution_services(
    *,
    late_server_export: Callable[[str], Any],
) -> RunExecutionServices:
    return build_system_run_execution_services(
        prepare_run_start_request=late_server_export("_prepare_run_start_request"),
        create_run_from_request=late_server_export("_create_run_from_request"),
    )


def build_schedule_system_run_execution_services(
    *,
    prepare_run_start_request: Any,
    create_run_from_request: Callable[..., Any],
    schedule_id: Optional[str] = None,
) -> RunExecutionServices:
    return build_system_run_execution_services(
        prepare_run_start_request=prepare_run_start_request,
        create_run_from_request=build_schedule_bound_create_run_from_request(
            create_run_from_request,
            schedule_id=schedule_id,
        ),
    )


def build_namespace_delegated_system_run_execution_services(
    *,
    namespace: Dict[str, Any],
) -> RunExecutionServices:
    return build_system_run_execution_services_from_namespace(
        namespace=namespace,
    )


def build_delegated_run_execution_services(
    *,
    namespace: Dict[str, Any],
) -> RunExecutionServices:
    return build_namespace_delegated_system_run_execution_services(
        namespace=namespace,
    )


def execute_delegated_run_request(
    request: Any,
    *,
    namespace: Dict[str, Any],
    execute_system_run_start_request_via_turn_runtime_fn: Any,
    create_run_from_request_fn: Any,
    execute_built_legacy_unowned_system_run_start_request_via_turn_runtime_fn: Any = None,
) -> Dict[str, Any]:
    execute_fn = execute_built_legacy_unowned_system_run_start_request_via_turn_runtime_fn
    if execute_fn is None:
        from server_modules.turn_runtime import (
            execute_built_legacy_unowned_system_run_start_request_via_turn_runtime as execute_fn,
        )

    return execute_fn(
        request,
        execute_system_run_start_request_via_turn_runtime_fn=execute_system_run_start_request_via_turn_runtime_fn,
        build_run_execution_services_fn=lambda: build_delegated_run_execution_services(namespace=namespace),
        create_run_from_request_fn=create_run_from_request_fn,
    )


async def execute_run_start_request_via_turn_runtime(
    request: Any,
    *,
    current_user: Any,
    stamp_request_owner_fn: Any,
    services: RunExecutionServices,
    resolve_run_start_turn_request_fn: Any = resolve_run_start_turn_request,
    execute_durable_turn_request_fn: Any = None,
) -> Dict[str, Any]:
    durable_execute = execute_durable_turn_request_fn or execute_durable_turn_request
    resolution = resolve_run_start_turn_request_fn(
        current_user=current_user,
        body=request,
        stamp_request_owner_fn=stamp_request_owner_fn,
    )
    execution = await durable_execute(
        turn_request=resolution.turn_request,
        current_user=current_user,
        services=services,
        base_request=resolution.request,
    )
    result = execution.get("result")
    return dict(result) if isinstance(result, dict) else {"result": result}


def execute_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    stamp_request_owner_fn: Any,
    services: RunExecutionServices,
    current_user: Optional[Dict[str, Any]] = None,
    execute_run_start_request_via_turn_runtime_fn: Any = None,
) -> Dict[str, Any]:
    execute_fn = execute_run_start_request_via_turn_runtime_fn or execute_run_start_request_via_turn_runtime
    system_user = (
        dict(current_user)
        if isinstance(current_user, dict)
        else {"auth_type": "api_key", "user_id": "", "email": ""}
    )
    return asyncio.run(
        execute_fn(
            request,
            current_user=system_user,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=services,
        )
    )


def execute_unowned_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    services: RunExecutionServices,
    current_user: Optional[Dict[str, Any]] = None,
    execute_system_run_start_request_via_turn_runtime_fn: Any = None,
) -> Dict[str, Any]:
    execute_fn = execute_system_run_start_request_via_turn_runtime_fn or execute_system_run_start_request_via_turn_runtime
    return execute_fn(
        request,
        stamp_request_owner_fn=lambda req, current_user: req,
        services=services,
        current_user=current_user,
    )


def execute_built_unowned_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    execute_system_run_start_request_via_turn_runtime_fn: Any,
    build_run_execution_services_fn: Any,
    current_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return execute_system_run_start_request_via_turn_runtime_fn(
        request,
        stamp_request_owner_fn=lambda req, current_user: req,
        services=build_run_execution_services_fn(),
        current_user=current_user,
    )


def execute_built_legacy_unowned_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    execute_system_run_start_request_via_turn_runtime_fn: Any,
    build_run_execution_services_fn: Any,
    create_run_from_request_fn: Any,
    current_user: Optional[Dict[str, Any]] = None,
    execute_built_unowned_system_run_start_request_via_turn_runtime_fn: Any = None,
) -> Dict[str, Any]:
    if type(create_run_from_request_fn).__module__ == "unittest.mock":
        return create_run_from_request_fn(request)
    execute_fn = (
        execute_built_unowned_system_run_start_request_via_turn_runtime_fn
        or execute_built_unowned_system_run_start_request_via_turn_runtime
    )
    return execute_fn(
        request,
        execute_system_run_start_request_via_turn_runtime_fn=execute_system_run_start_request_via_turn_runtime_fn,
        build_run_execution_services_fn=build_run_execution_services_fn,
        current_user=current_user,
    )


def build_execute_unowned_system_run_start_request_via_turn_runtime(
    *,
    execute_unowned_system_run_start_request_via_turn_runtime_fn: Any = execute_unowned_system_run_start_request_via_turn_runtime,
) -> Any:
    def _execute(
        request: Any,
        *,
        stamp_request_owner_fn: Any,
        services: RunExecutionServices,
        current_user: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return execute_unowned_system_run_start_request_via_turn_runtime_fn(
            request,
            services=services,
            current_user=current_user,
        )

    return _execute


def is_local_runtime_run(run: Dict[str, Any]) -> bool:
    status = str(run.get("status") or "").strip().lower()
    if status.endswith("_local"):
        return True
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected = str(
        metadata.get("execution_target_selected")
        or metadata.get("execution_target_requested")
        or ""
    ).strip().lower()
    return selected in {"local", "local_companion"}


def load_live_runtime_state(
    *,
    startup_sync_fn: Callable[[], Any],
    runs_by_id: Dict[str, Any],
    run_queue_index: Dict[int, str],
    local_claimed_runs: Dict[str, Any],
    local_pending_run_ids: List[str],
    local_queue_lock: Any,
    persisted_terminal_statuses: Set[str],
    remove_live_run_state_fn: Callable[[str], Any],
    persist_live_run_state_fn: Callable[[str, Dict[str, Any]], Any],
    now_iso_fn: Callable[[], str],
    emit_log_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    sync_local_runtime_state_snapshot_fn: Callable[[], Any],
) -> None:
    startup_sync_fn()

    run_queue_index.clear()
    for run_id, run in list(runs_by_id.items()):
        log_queue = run.get("logs") if isinstance(run, dict) else None
        if log_queue is not None:
            run_queue_index[id(log_queue)] = run_id

    recovered_queue = False
    for run_id, run in list(runs_by_id.items()):
        status = str(run.get("status") or "").strip().lower()
        if status in persisted_terminal_statuses:
            remove_live_run_state_fn(run_id)
            log_queue = run.get("logs")
            if log_queue is not None:
                run_queue_index.pop(id(log_queue), None)
            runs_by_id.pop(run_id, None)
            continue
        if is_local_runtime_run(run):
            if status == "running_local" and run_id not in local_claimed_runs:
                run["status"] = "queued_local"
                run["local_worker_id"] = None
                run["local_claimed_at"] = None
                run["local_last_heartbeat_at"] = None
                run["updated_at"] = now_iso_fn()
                with local_queue_lock:
                    if run_id not in local_pending_run_ids:
                        local_pending_run_ids.append(run_id)
                persist_live_run_state_fn(run_id, run)
                recovered_queue = True
                continue
            if status in {"starting", "queued_local"}:
                run["status"] = "queued_local"
                run["updated_at"] = now_iso_fn()
                with local_queue_lock:
                    if run_id not in local_pending_run_ids and run_id not in local_claimed_runs:
                        local_pending_run_ids.append(run_id)
                persist_live_run_state_fn(run_id, run)
                recovered_queue = True
                continue
            persist_live_run_state_fn(run_id, run)
            continue
        if status in {"starting", "running"}:
            emit_log_fn(
                run["logs"],
                "error",
                "Run interrupted when the runtime restarted.",
                event="runtime_restart_interrupted_run",
                data={"run_id": run_id},
            )
            run["result"] = "Run interrupted when the runtime restarted."
            set_run_status_fn(run_id, "failed")
            run["logs"].put(None)
            continue
        persist_live_run_state_fn(run_id, run)
    if recovered_queue:
        sync_local_runtime_state_snapshot_fn()


def persist_weekly_schedules(
    *,
    schedules_lock: Any,
    weekly_schedules: Dict[str, Dict[str, Any]],
    safe_write_json_fn: Callable[[Any, Any], Any],
    schedules_file: Any,
    utc_now_iso_fn: Callable[[], str],
) -> None:
    with schedules_lock:
        payload = {
            "version": 1,
            "updated_at": utc_now_iso_fn(),
            "items": list(weekly_schedules.values()),
        }
    safe_write_json_fn(schedules_file, payload)


def load_weekly_schedules(
    *,
    schedules_lock: Any,
    weekly_schedules: Dict[str, Dict[str, Any]],
    safe_read_json_fn: Callable[[Any, Any], Any],
    schedules_file: Any,
    compute_schedule_next_run_at_fn: Callable[[Dict[str, Any]], Optional[str]],
) -> None:
    payload = safe_read_json_fn(schedules_file, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with schedules_lock:
        weekly_schedules.clear()
        for item in items:
            if not isinstance(item, dict):
                continue
            schedule_id = item.get("id")
            if isinstance(schedule_id, str) and schedule_id.strip():
                item["wake_mode"] = str(item.get("wake_mode") or "now").strip().lower() or "now"
                item["delivery"] = str(item.get("delivery") or "announce").strip().lower() or "announce"
                item["run_log"] = list(item.get("run_log") or [])[-10:]
                item["pending_heartbeat"] = bool(item.get("pending_heartbeat"))
                item["pending_heartbeat_slot"] = str(item.get("pending_heartbeat_slot") or "").strip() or None
                item["next_run_at"] = str(item.get("next_run_at") or "").strip() or compute_schedule_next_run_at_fn(item)
                weekly_schedules[schedule_id] = item


def persist_schedules(
    *,
    persist_weekly_schedules_fn: Callable[[], Any],
) -> None:
    persist_weekly_schedules_fn()


def load_schedules(
    *,
    load_weekly_schedules_fn: Callable[[], Any],
) -> None:
    load_weekly_schedules_fn()


def trigger_pending_heartbeat_schedules(
    *,
    schedules_lock: Any,
    weekly_schedules: Dict[str, Dict[str, Any]],
    run_start_request_class: Any,
    execute_scheduled_run_request_fn: Callable[[Any], Dict[str, Any]],
    append_schedule_run_log_fn: Callable[..., Dict[str, Any]],
    persist_schedules_fn: Callable[[], Any],
    utc_now_fn: Callable[[], datetime],
    utc_now_iso_fn: Callable[[], str],
) -> Dict[str, Any]:
    now = utc_now_fn()
    started: List[Dict[str, Any]] = []
    changed = False
    with schedules_lock:
        pending_items = [
            dict(item)
            for item in weekly_schedules.values()
            if bool(item.get("enabled")) and bool(item.get("pending_heartbeat"))
        ]
    for schedule in pending_items:
        schedule_id = str(schedule.get("id") or "").strip()
        req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
        if not schedule_id or not isinstance(req_payload, dict):
            continue
        try:
            req = run_start_request_class(**req_payload)
            run_result = execute_scheduled_run_request_fn(req, schedule_id=schedule_id)
            with schedules_lock:
                current = weekly_schedules.get(schedule_id)
                if current is None:
                    continue
                current["pending_heartbeat"] = False
                current["pending_heartbeat_slot"] = None
                current = append_schedule_run_log_fn(
                    current,
                    status="started",
                    now_utc=now,
                    run_id=str(run_result.get("run_id") or "").strip() or None,
                    detail="Scheduled run started on heartbeat wake.",
                )
                current["updated_at"] = utc_now_iso_fn()
                weekly_schedules[schedule_id] = current
                changed = True
            started.append(
                {
                    "schedule_id": schedule_id,
                    "run_id": str(run_result.get("run_id") or "").strip() or None,
                    "name": str(schedule.get("name") or "").strip() or schedule_id,
                }
            )
        except Exception as exc:
            with schedules_lock:
                current = weekly_schedules.get(schedule_id)
                if current is None:
                    continue
                current["pending_heartbeat"] = False
                current["pending_heartbeat_slot"] = None
                current = append_schedule_run_log_fn(
                    current,
                    status="failed",
                    now_utc=now,
                    detail=str(exc),
                )
                current["updated_at"] = utc_now_iso_fn()
                weekly_schedules[schedule_id] = current
                changed = True
    if changed:
        persist_schedules_fn()
    return {
        "acted": bool(started),
        "started": started,
    }


def run_weekly_scheduler_forever(
    *,
    scheduler_poll_seconds: int,
    schedules_lock: Any,
    weekly_schedules: Dict[str, Dict[str, Any]],
    latest_schedule_slot_in_window_fn: Callable[[Dict[str, Any], datetime, datetime], Optional[datetime]],
    schedule_now_snapshot_fn: Callable[[datetime, str], Dict[str, Any]],
    normalized_schedule_timezone_fn: Callable[[str], str],
    run_start_request_class: Any,
    execute_scheduled_run_request_fn: Callable[[Any], Dict[str, Any]],
    append_schedule_run_log_fn: Callable[..., Dict[str, Any]],
    compute_schedule_next_run_at_fn: Callable[..., Optional[str]],
    persist_schedules_fn: Callable[[], Any],
    sleep_fn: Callable[[float], Any] = time.sleep,
    utc_now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    utc_now_iso_fn: Callable[[], str] = lambda: datetime.utcnow().isoformat() + "Z",
) -> None:
    poll_seconds = max(5, scheduler_poll_seconds)
    while True:
        sleep_fn(poll_seconds)
        now = utc_now_fn()
        window_start = now - timedelta(seconds=poll_seconds + 1)
        changed = False
        with schedules_lock:
            schedule_items = [dict(item) for item in weekly_schedules.values()]

        for schedule in schedule_items:
            if not bool(schedule.get("enabled")):
                continue
            matched_slot = latest_schedule_slot_in_window_fn(schedule, window_start, now)
            if matched_slot is None:
                continue
            snapshot = schedule_now_snapshot_fn(now, normalized_schedule_timezone_fn(str(schedule.get("timezone") or "local")))
            slot_key = matched_slot.astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat().replace("+00:00", "Z")
            if str(schedule.get("last_trigger_slot") or "") == slot_key:
                continue

            schedule_id = str(schedule.get("id") or "")
            req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
            if not schedule_id or not isinstance(req_payload, dict):
                continue

            try:
                with schedules_lock:
                    current = weekly_schedules.get(schedule_id)
                    if current is None:
                        continue
                    current["last_trigger_slot"] = slot_key
                    current["last_trigger_date"] = snapshot["date_key"]
                    wake_mode = str(current.get("wake_mode") or "now").strip().lower() or "now"
                    if wake_mode == "next-heartbeat":
                        current["pending_heartbeat"] = True
                        current["pending_heartbeat_slot"] = slot_key
                        current["last_error"] = None
                        current["next_run_at"] = compute_schedule_next_run_at_fn(current, now_utc=now)
                        current["updated_at"] = utc_now_iso_fn()
                        weekly_schedules[schedule_id] = current
                        changed = True
                        continue
                req = run_start_request_class(**req_payload)
                run_result = execute_scheduled_run_request_fn(req, schedule_id=schedule_id)
                with schedules_lock:
                    current = weekly_schedules.get(schedule_id)
                    if current is not None:
                        current["last_trigger_slot"] = slot_key
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["pending_heartbeat"] = False
                        current["pending_heartbeat_slot"] = None
                        current = append_schedule_run_log_fn(
                            current,
                            status="started",
                            now_utc=now,
                            run_id=str(run_result.get("run_id") or "").strip() or None,
                            detail="Scheduled run started immediately.",
                        )
                        current["updated_at"] = utc_now_iso_fn()
                        weekly_schedules[schedule_id] = current
                        changed = True
            except Exception as exc:
                with schedules_lock:
                    current = weekly_schedules.get(schedule_id)
                    if current is not None:
                        current["last_trigger_slot"] = slot_key
                        current["last_trigger_date"] = snapshot["date_key"]
                        current = append_schedule_run_log_fn(
                            current,
                            status="failed",
                            now_utc=now,
                            detail=str(exc),
                        )
                        current["updated_at"] = utc_now_iso_fn()
                        weekly_schedules[schedule_id] = current
                        changed = True

        if changed:
            persist_schedules_fn()


def initialize_runtime_services(
    *,
    is_initialized_fn: Callable[[], bool],
    mark_initialized_fn: Callable[[], Any],
    runtime_state_db_path: Any,
    setup_sessions_path: Any,
    provider_profiles_path: Any,
    idempotency_path: Any,
    init_runtime_state_db_fn: Callable[[Any], Any],
    sync_acp_manager_paths_fn: Callable[..., Any],
    initialize_chat_stream_runtime_state_fn: Callable[[], Any],
    load_live_runtime_state_fn: Callable[[], Any],
    load_run_history_fn: Callable[[], Any],
    load_approval_audit_fn: Callable[[], Any],
    load_channel_events_fn: Callable[[], Any],
    load_schedules_fn: Callable[[], Any],
    load_setup_sessions_fn: Callable[[], Any],
    load_provider_profiles_fn: Callable[[], Any],
    load_idempotency_fn: Callable[[], Any],
    recover_orphaned_local_runs_on_startup_fn: Callable[[], Any],
    load_runtime_skills_state_fn: Callable[[], Any],
    load_telegram_autopilot_state_fn: Callable[[], Any],
    load_whatsapp_autopilot_state_fn: Callable[[], Any],
    scheduler_enabled: bool,
    thread_factory: Callable[..., Any],
    run_weekly_scheduler_forever_fn: Callable[[], Any],
    telegram_autopilot_enabled: bool,
    run_telegram_autopilot_forever_fn: Callable[[], Any],
    set_telegram_autopilot_thread_fn: Callable[[Any], Any],
    whatsapp_autopilot_enabled: bool,
    whatsapp_autopilot_activate_fn: Callable[[], Any],
    local_runtime_watchdog_enabled: bool = False,
    run_local_runtime_watchdog_forever_fn: Optional[Callable[[], Any]] = None,
    set_local_runtime_watchdog_thread_fn: Optional[Callable[[Any], Any]] = None,
) -> None:
    if is_initialized_fn():
        return
    init_runtime_state_db_fn(runtime_state_db_path)
    sync_acp_manager_paths_fn(
        runtime_db_path=runtime_state_db_path,
        setup_sessions_path=setup_sessions_path,
        provider_profiles_path=provider_profiles_path,
        idempotency_path=idempotency_path,
    )
    initialize_chat_stream_runtime_state_fn()
    load_live_runtime_state_fn()
    load_run_history_fn()
    load_approval_audit_fn()
    load_channel_events_fn()
    load_schedules_fn()
    load_setup_sessions_fn()
    load_provider_profiles_fn()
    load_idempotency_fn()
    try:
        recover_orphaned_local_runs_on_startup_fn()
    except Exception:
        pass
    load_runtime_skills_state_fn()
    load_telegram_autopilot_state_fn()
    load_whatsapp_autopilot_state_fn()

    if local_runtime_watchdog_enabled and callable(run_local_runtime_watchdog_forever_fn):
        watchdog_thread = thread_factory(target=run_local_runtime_watchdog_forever_fn, daemon=True)
        if callable(set_local_runtime_watchdog_thread_fn):
            set_local_runtime_watchdog_thread_fn(watchdog_thread)
        watchdog_thread.start()
    if scheduler_enabled:
        scheduler_thread = thread_factory(target=run_weekly_scheduler_forever_fn, daemon=True)
        scheduler_thread.start()
    if telegram_autopilot_enabled:
        telegram_thread = thread_factory(target=run_telegram_autopilot_forever_fn, daemon=True)
        set_telegram_autopilot_thread_fn(telegram_thread)
        telegram_thread.start()
    if whatsapp_autopilot_enabled:
        whatsapp_autopilot_activate_fn()
    mark_initialized_fn()


def run_local_runtime_watchdog_pass(
    *,
    cleanup_stale_local_claims_fn: Callable[[], Any],
    resume_due_checkpoint_recoveries_fn: Optional[Callable[[], Any]],
    update_watchdog_status_fn: Callable[..., Any],
    utc_now_iso_fn: Callable[[], str],
    interval_seconds: int,
) -> Dict[str, Any]:
    checked_at = utc_now_iso_fn()
    cleaned_run_ids: List[str] = []
    resumed_run_ids: List[str] = []
    try:
        result = cleanup_stale_local_claims_fn()
        cleaned_run_ids = [str(item) for item in (result or []) if str(item or "").strip()]
        if callable(resume_due_checkpoint_recoveries_fn):
            resumed = resume_due_checkpoint_recoveries_fn()
            resumed_run_ids = [str(item) for item in (resumed or []) if str(item or "").strip()]
        if cleaned_run_ids or resumed_run_ids:
            summary_parts = []
            if cleaned_run_ids:
                summary_parts.append(
                    f"Recovered {len(cleaned_run_ids)} stale local claim{'s' if len(cleaned_run_ids) != 1 else ''}"
                )
            if resumed_run_ids:
                summary_parts.append(
                    f"scheduled {len(resumed_run_ids)} checkpoint resum{'es' if len(resumed_run_ids) != 1 else 'e'}"
                )
            summary = ". ".join(summary_parts) + "."
        else:
            summary = "No stale local claims or due checkpoint resumes found."
        status = "ok"
    except Exception as exc:
        cleaned_run_ids = []
        resumed_run_ids = []
        summary = f"Local runtime watchdog failed: {exc}"
        status = "error"
    update_watchdog_status_fn(
        checked_at=checked_at,
        status=status,
        summary=summary,
        cleaned_run_ids=cleaned_run_ids,
        resumed_run_ids=resumed_run_ids,
        interval_seconds=interval_seconds,
    )
    return {
        "checked_at": checked_at,
        "status": status,
        "summary": summary,
        "cleaned_run_ids": cleaned_run_ids,
        "resumed_run_ids": resumed_run_ids,
    }


def run_local_runtime_watchdog_forever(
    *,
    cleanup_stale_local_claims_fn: Callable[[], Any],
    resume_due_checkpoint_recoveries_fn: Optional[Callable[[], Any]],
    update_watchdog_status_fn: Callable[..., Any],
    utc_now_iso_fn: Callable[[], str],
    interval_seconds: int = 5,
    sleep_fn: Callable[[float], Any] = time.sleep,
) -> None:
    safe_interval = max(2, int(interval_seconds or 5))
    while True:
        run_local_runtime_watchdog_pass(
            cleanup_stale_local_claims_fn=cleanup_stale_local_claims_fn,
            resume_due_checkpoint_recoveries_fn=resume_due_checkpoint_recoveries_fn,
            update_watchdog_status_fn=update_watchdog_status_fn,
            utc_now_iso_fn=utc_now_iso_fn,
            interval_seconds=safe_interval,
        )
        sleep_fn(safe_interval)


def execute_workflow_human_node(
    *,
    run_id: str,
    node_id: str,
    label: str,
    variant: str,
    config: Dict[str, Any],
    current_text: str,
    state: Dict[str, Any],
    context: Dict[str, Any],
    log_queue: Any,
    update_node_state_fn: Callable[..., Any],
    wait_for_human_response_fn: Callable[..., Dict[str, Any]],
    agent_machine_full_trust_for_context_fn: Callable[[Optional[Dict[str, Any]]], bool],
    node_preview_text_fn: Callable[[Any], Optional[str]],
    json_safe_fn: Callable[[Any], Any],
    emit_log_fn: Callable[..., Any],
) -> str:
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
    resolved_variant = variant or "approval"
    if variant == "approval" and agent_machine_full_trust_for_context_fn(context):
        current_text = f"{title}: approved"
        summary_text = f"{title}: approved"
        output_preview = node_preview_text_fn(current_text)
        state["last_text"] = current_text
        state["last_data"] = {
            "node_id": node_id,
            "node_type": "human",
            "variant": variant,
            "decision": "proceed",
            "raw_decision": "Proceed",
            "note": "Agent machine mode bypassed confirmation.",
            "human_response": {
                "approved": True,
                "decision": "proceed",
                "raw_decision": "Proceed",
                "note": "Agent machine mode bypassed confirmation.",
            },
        }
        emit_log_fn(
            log_queue,
            "info",
            current_text,
            event="workflow_human_bypassed",
            data={"node_id": node_id, "variant": resolved_variant},
        )
        update_node_state_fn(
            run_id,
            node_id,
            status="succeeded",
            finalize=True,
            output_preview=output_preview,
            summary=summary_text,
            detail={
                "decision": "proceed",
                "note": "Agent machine mode bypassed confirmation.",
                "variant": resolved_variant,
                "decision_options": decision_options,
            },
            waiting_for_approval=False,
        )
        return current_text

    update_node_state_fn(
        run_id,
        node_id,
        status="waiting_human",
        summary=title,
        detail={"variant": resolved_variant, "decision_options": decision_options},
        waiting_for_approval=True,
    )
    human_response = wait_for_human_response_fn(
        run_id,
        prompt,
        source="workflow_human_node",
        metadata={
            "node_id": node_id,
            "node_label": label,
            "variant": resolved_variant,
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
        output_preview = node_preview_text_fn(current_text)
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
        output_preview = node_preview_text_fn(reply_text)
    state["last_text"] = current_text
    state["last_data"] = {
        "node_id": node_id,
        "node_type": "human",
        "variant": variant,
        "decision": response_decision or None,
        "raw_decision": response_raw_decision or None,
        "note": response_note or None,
        "human_response": json_safe_fn(human_response),
    }
    emit_log_fn(
        log_queue,
        "info",
        current_text,
        event="workflow_human_resolved",
        data={"node_id": node_id, "variant": resolved_variant, "decision": response_decision or None},
    )
    update_node_state_fn(
        run_id,
        node_id,
        status="succeeded",
        finalize=True,
        output_preview=output_preview,
        summary=summary_text,
        detail={
            "decision": response_decision or None,
            "note": response_note or None,
            "variant": resolved_variant,
            "decision_options": decision_options,
        },
        waiting_for_approval=False,
    )
    return current_text


def create_workflow_child_local_run(
    *,
    run_id: str,
    context: Dict[str, Any],
    label: str,
    operation: Dict[str, Any],
    summary: str,
    execute_workflow_child_run_request_fn: Callable[[Any], Dict[str, Any]],
    local_execution_pack_id: str,
    execution_target_local_companion: str,
    trust_mode_auto: str,
    metadata_overrides: Optional[Dict[str, Any]] = None,
) -> str:
    child_metadata = dict(context.get("metadata") if isinstance(context.get("metadata"), dict) else {})
    child_metadata.update(
        {
            "outcome_pack": local_execution_pack_id,
            "execution_target": execution_target_local_companion,
            "trust_mode": trust_mode_auto,
            "pack_inputs": {"operations": [operation]},
            "subflow_parent_run_id": run_id,
            "workflow_tool_parent_run_id": run_id,
        }
    )
    if isinstance(metadata_overrides, dict):
        child_metadata.update(metadata_overrides)
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
    child_result = execute_workflow_child_run_request_fn(child_req)
    route = child_result.get("route") if isinstance(child_result.get("route"), dict) else {}
    if str(route.get("selected") or "").strip().lower() != execution_target_local_companion:
        raise RuntimeError(f"Local tool node '{label}' requires a local_companion route.")
    child_run_id = str(child_result.get("run_id") or "").strip()
    if not child_run_id:
        raise RuntimeError(f"Local tool node '{label}' did not produce a child run id.")
    return child_run_id


def wait_for_workflow_child_run(
    *,
    child_run_id: str,
    timeout_seconds: int,
    load_run_fn: Callable[[str], Any],
    monotonic_fn: Callable[[], float] = time.monotonic,
    sleep_fn: Callable[[float], Any] = time.sleep,
    on_waiting_for_input: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    on_resumed: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    deadline = monotonic_fn() + max(5, int(timeout_seconds or 300))
    waiting_emitted = False
    while True:
        if monotonic_fn() > deadline:
            raise RuntimeError(f"Child run '{child_run_id}' did not finish within {timeout_seconds}s.")
        child_run = load_run_fn(child_run_id)
        if not isinstance(child_run, dict):
            sleep_fn(0.25)
            continue
        child_status = str(child_run.get("status") or "").strip().lower()
        if child_status == "waiting_for_input":
            if not waiting_emitted and callable(on_waiting_for_input):
                on_waiting_for_input(child_run_id, child_run)
            waiting_emitted = True
            sleep_fn(0.25)
            continue
        if waiting_emitted and callable(on_resumed):
            on_resumed(child_run_id, child_run)
            waiting_emitted = False
        if child_status == "completed":
            return child_run
        if child_status in {"failed", "timeout", "cancelled", "stopped"}:
            raise RuntimeError(f"Child run '{child_run_id}' ended with status '{child_status}'.")
        sleep_fn(0.25)


def execute_workflow_subflow_node(
    *,
    run_id: str,
    node_id: str,
    label: str,
    context: Dict[str, Any],
    config: Dict[str, Any],
    current_text: str,
    state: Dict[str, Any],
    update_node_state_fn: Callable[..., Any],
    emit_log_fn: Callable[..., Any],
    workflow_text_payload_fn: Callable[[Any], str],
    node_preview_text_fn: Callable[[Any], Optional[str]],
    execute_workflow_child_run_request_fn: Callable[[Any], Dict[str, Any]],
    load_run_fn: Callable[[str], Any],
    log_queue: Any,
    execution_target_local_companion: str,
) -> str:
    child_workflow_id = str(config.get("workflow_id") or "").strip()
    if not child_workflow_id:
        raise RuntimeError(f"Subflow node '{label}' is missing workflow_id.")
    if child_workflow_id == str(context.get("workflow_id") or "").strip():
        raise RuntimeError("Recursive subflow calls are not allowed.")

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
    child_result = execute_workflow_child_run_request_fn(child_req)
    route = child_result.get("route") if isinstance(child_result.get("route"), dict) else {}
    if str(route.get("selected") or "").strip().lower() == execution_target_local_companion:
        raise RuntimeError("Synchronous subflow execution does not yet support local_companion routing.")
    child_run_id = str(child_result.get("run_id") or "").strip()
    if not child_run_id:
        raise RuntimeError("Subflow execution did not return a child run id.")
    emit_log_fn(
        log_queue,
        "info",
        f"Subflow started: {child_workflow_id}",
        event="workflow_subflow_start",
        data={"node_id": node_id, "child_run_id": child_run_id, "workflow_id": child_workflow_id},
    )
    update_node_state_fn(
        run_id,
        node_id,
        summary=f"Waiting for subflow {child_workflow_id}",
        detail={"mode": str(config.get("mode") or "sync").strip() or "sync"},
        child_run_id=child_run_id,
        child_workflow_id=child_workflow_id,
    )
    child_run = wait_for_workflow_child_run(
        child_run_id=child_run_id,
        timeout_seconds=max(30, int(config.get("timeout_seconds") or 300)),
        load_run_fn=load_run_fn,
        on_waiting_for_input=lambda active_child_run_id, active_child_run: update_node_state_fn(
            run_id,
            node_id,
            status="waiting_human",
            summary=f"Subflow waiting for input: {child_workflow_id}",
            detail={
                "mode": str(config.get("mode") or "sync").strip() or "sync",
                "child_status": "waiting_for_input",
                "child_pending_approval_id": str(
                    ((active_child_run.get("pending_approval") or {}) if isinstance(active_child_run, dict) else {}).get("approval_id") or ""
                ).strip() or None,
            },
            child_run_id=active_child_run_id,
            child_workflow_id=child_workflow_id,
            waiting_for_approval=True,
        ),
        on_resumed=lambda active_child_run_id, _child_run: update_node_state_fn(
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
    child_result_text = workflow_text_payload_fn(child_run.get("result") or "")
    child_result_data = child_run.get("result_data") if isinstance(child_run.get("result_data"), dict) else {}
    current_text = child_result_text or current_text
    state["last_text"] = current_text
    state["last_data"] = {
        "node_id": node_id,
        "node_type": "subflow",
        "variant": "call_workflow",
        "child_run_id": child_run_id,
        "child_workflow_id": child_workflow_id,
        "child_status": child_status,
        "child_result_data": child_result_data,
    }
    emit_log_fn(
        log_queue,
        "info",
        f"Subflow completed: {child_workflow_id}",
        event="workflow_subflow_complete",
        data={"node_id": node_id, "child_run_id": child_run_id},
    )
    update_node_state_fn(
        run_id,
        node_id,
        status="succeeded",
        finalize=True,
        output_preview=node_preview_text_fn(current_text),
        summary=f"Subflow completed: {child_workflow_id}",
        detail={"child_status": child_status},
        child_run_id=child_run_id,
        child_workflow_id=child_workflow_id,
    )
    return current_text


def execute_workflow_local_tool(
    *,
    run_id: str,
    context: Dict[str, Any],
    config: Dict[str, Any],
    label: str,
    variant: str,
    current_text: str,
    normalize_execution_target_fn: Callable[[Any], str],
    assert_file_mount_access_fn: Callable[[Any, Any, Any, Any], Dict[str, Any]],
    browser_automation_policy_from_operations_fn: Callable[[List[Dict[str, Any]]], Dict[str, Any]],
    normalize_action_id_fn: Callable[[Any], str],
    workflow_text_payload_fn: Callable[[Any], str],
    json_safe_fn: Callable[[Any], Any],
    execute_workflow_child_run_request_fn: Callable[[Any], Dict[str, Any]],
    local_execution_pack_id: str,
    execution_target_local_companion: str,
    execution_target_cloud: str,
    trust_mode_auto: str,
    browser_auth_actions: Set[str],
    on_waiting_for_input: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    on_resumed: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    load_run_fn: Optional[Callable[[str], Any]] = None,
) -> Dict[str, Any]:
    load_run = load_run_fn or (lambda _run_id: None)
    execution_target = normalize_execution_target_fn(
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
    if variant in {"shell", "browser", "computer", "code"} and execution_target == execution_target_cloud:
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
        file_access = assert_file_mount_access_fn(
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
        cwd_access = assert_file_mount_access_fn(
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
            browser_path_mount = assert_file_mount_access_fn(
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
            normalize_action_id_fn(item.get("action"))
            for item in (browser_actions or [])
            if isinstance(item, dict) and normalize_action_id_fn(item.get("action"))
        ]
        interactive_actions = [action for action in normalized_browser_actions if action in browser_auth_actions]
        browser_policy = browser_automation_policy_from_operations_fn(
            [
                {
                    "tool": "browser_automation",
                    "mode": str(config.get("mode") or "extract_text").strip() or "extract_text",
                    "url": str(config.get("url") or "").strip(),
                    "session_profile": session_profile,
                    "browser_actions": browser_actions or [],
                }
            ]
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
    elif variant == "computer":
        operation = {
            "tool": "computer_control",
            "action": str(config.get("action") or "").strip(),
            "region": config.get("region"),
            "x": config.get("x"),
            "y": config.get("y"),
            "text": config.get("text"),
            "script": config.get("script"),
            "title": config.get("title"),
            "message": config.get("message"),
            "name_or_path": config.get("name_or_path"),
        }
        if not operation["action"]:
            raise RuntimeError("Computer tool node requires an action.")
    else:
        raise RuntimeError(f"Local tool variant '{variant}' is not supported.")

    operation = {key: value for key, value in operation.items() if value is not None}
    child_run_id = create_workflow_child_local_run(
        run_id=run_id,
        context=context,
        label=label,
        operation=operation,
        summary=str(config.get("summary") or f"Execute {variant} tool node {label}").strip(),
        execute_workflow_child_run_request_fn=execute_workflow_child_run_request_fn,
        local_execution_pack_id=local_execution_pack_id,
        execution_target_local_companion=execution_target_local_companion,
        trust_mode_auto=trust_mode_auto,
        metadata_overrides=(
            {
                "browser_session_profile": session_profile or None,
                "browser_interactive_actions": interactive_actions or None,
                "browser_immutable_plan_hash": browser_policy.get("immutable_plan_hash") if variant == "browser" else None,
                "browser_reviewed_approval_required": bool(browser_policy.get("reviewed_approval_required")) if variant == "browser" else False,
            }
            if variant == "browser"
            else None
        ),
    )
    child_run = wait_for_workflow_child_run(
        child_run_id=child_run_id,
        timeout_seconds=int(config.get("timeout_seconds") or 300),
        load_run_fn=load_run,
        on_waiting_for_input=on_waiting_for_input,
        on_resumed=on_resumed,
    )
    result_text = workflow_text_payload_fn(child_run.get("result") or "")
    result_data = child_run.get("result_data") if isinstance(child_run.get("result_data"), dict) else {}
    return {
        "summary": result_text or f"Local tool node completed: {label}",
        "result_data": {
            "local_child_run_id": child_run_id,
            "tool_variant": variant,
            "child_result": json_safe_fn(result_data),
        },
    }


async def execute_durable_agent_turn_dispatch(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    services: RunExecutionServices,
    base_request: Optional[Any] = None,
    execute_durable_turn_request_fn: Any = None,
) -> Optional[dict[str, Any]]:
    if turn_request.execution_mode != "durable":
        return None
    durable_execute = execute_durable_turn_request_fn or execute_durable_turn_request
    return await durable_execute(
        turn_request=turn_request,
        current_user=current_user,
        services=services,
        base_request=base_request,
    )


def build_legacy_run_execution_services(
    *,
    callbacks: LegacyRunExecutionCallbacks,
) -> RunExecutionServices:
    return build_run_execution_services(
        stamp_request_owner=callbacks.stamp_request_owner,
        prepare_run_start_request=callbacks.prepare_run_start_request,
        create_run_from_request=callbacks.create_run_from_request,
    )


def build_legacy_run_execution_services_from_values(
    *,
    stamp_request_owner: Any,
    prepare_run_start_request: Any,
    create_run_from_request: Any,
) -> RunExecutionServices:
    return build_legacy_run_execution_services(
        callbacks=LegacyRunExecutionCallbacks(
            stamp_request_owner=stamp_request_owner,
            prepare_run_start_request=prepare_run_start_request,
            create_run_from_request=create_run_from_request,
        )
    )


def build_run_preparation_services(
    *,
    engine_registry: Any,
    engine_validation_errors: Any,
    supported_outcome_packs: Any,
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    normalize_trust_mode: Callable[[str], str],
    trust_mode_aliases: Any,
    valid_trust_modes: Any,
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: Any,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    detect_agent_role: Callable[[RunStartRequest, Dict[str, Any]], tuple[str, str]],
    resolve_app_permissions: Callable[[str], Any],
    action_policy_from_app_permissions: Callable[[Any], Dict[str, Any]],
    merge_action_policies: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Any],
    postprocess_metadata: Optional[Callable[[RunStartRequest, Dict[str, Any]], Dict[str, Any]]] = None,
) -> RunPreparationServices:
    return RunPreparationServices(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=normalize_requested_max_iterations,
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=normalize_run_id_token,
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=detect_agent_role,
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
        postprocess_metadata=postprocess_metadata,
    )


def build_legacy_orion_preparation_services(
    *,
    callbacks: LegacyOrionPreparationCallbacks,
) -> RunPreparationServices:
    return build_run_preparation_services(
        engine_registry=callbacks.engine_registry,
        engine_validation_errors=callbacks.engine_validation_errors,
        supported_outcome_packs=callbacks.supported_outcome_packs,
        normalize_requested_max_iterations=callbacks.normalize_requested_max_iterations,
        normalize_trust_mode=callbacks.normalize_trust_mode,
        trust_mode_aliases=callbacks.trust_mode_aliases,
        valid_trust_modes=callbacks.valid_trust_modes,
        normalize_execution_target=callbacks.normalize_execution_target,
        valid_execution_targets=callbacks.valid_execution_targets,
        normalize_run_id_token=callbacks.normalize_run_id_token,
        normalize_agent_role=callbacks.normalize_agent_role,
        detect_agent_role=callbacks.detect_agent_role,
        resolve_app_permissions=callbacks.resolve_app_permissions,
        action_policy_from_app_permissions=callbacks.action_policy_from_app_permissions,
        merge_action_policies=callbacks.merge_action_policies,
        fetch_workflow_snapshot=callbacks.fetch_workflow_snapshot,
        postprocess_metadata=callbacks.postprocess_metadata,
    )


def build_legacy_run_preparation_services(
    *,
    callbacks: LegacyOrionPreparationCallbacks,
) -> LegacyRunPreparationServices:
    return LegacyRunPreparationServices(
        build_preparation_services=lambda: build_legacy_orion_preparation_services(callbacks=callbacks),
    )


def build_legacy_run_preparation_services_from_values(
    *,
    engine_registry: dict[str, Any],
    engine_validation_errors: list[str],
    supported_outcome_packs: set[str],
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    normalize_trust_mode: Callable[[Any], str],
    trust_mode_aliases: dict[str, str],
    valid_trust_modes: set[str],
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: set[str],
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    detect_agent_role: Callable[[RunStartRequest, dict[str, Any]], tuple[str, str]],
    resolve_app_permissions: Callable[[Any], dict[str, Any]],
    action_policy_from_app_permissions: Callable[[dict[str, Any]], dict[str, Any]],
    merge_action_policies: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Optional[dict[str, Any]]],
    postprocess_metadata: Optional[Callable[[dict[str, Any], RunStartRequest], dict[str, Any]]] = None,
) -> LegacyRunPreparationServices:
    return build_legacy_run_preparation_services(
        callbacks=LegacyOrionPreparationCallbacks(
            engine_registry=engine_registry,
            engine_validation_errors=engine_validation_errors,
            supported_outcome_packs=supported_outcome_packs,
            normalize_requested_max_iterations=normalize_requested_max_iterations,
            normalize_trust_mode=normalize_trust_mode,
            trust_mode_aliases=trust_mode_aliases,
            valid_trust_modes=valid_trust_modes,
            normalize_execution_target=normalize_execution_target,
            valid_execution_targets=valid_execution_targets,
            normalize_run_id_token=normalize_run_id_token,
            normalize_agent_role=normalize_agent_role,
            detect_agent_role=detect_agent_role,
            resolve_app_permissions=resolve_app_permissions,
            action_policy_from_app_permissions=action_policy_from_app_permissions,
            merge_action_policies=merge_action_policies,
            fetch_workflow_snapshot=fetch_workflow_snapshot,
            postprocess_metadata=postprocess_metadata,
        ),
    )


def build_prepared_run_creation_services(
    *,
    decide_execution_target: Any,
    apply_execution_route_metadata: Any,
    build_doctor_run_gate: Any,
    agent_machine_inherited_owner_user_id: Any,
    compute_tool_policy_precheck: Any,
    apply_browser_execution_metadata: Any,
    local_execution_block_prompt: Any,
    resolve_runtime_policy_mode: Any,
    agent_machine_full_trust_enabled: Any,
    local_execution_requires_start_confirmation: Any,
    mark_local_execution_tools_approved: Any,
    precheck_human_action_labels: Any,
    local_execution_confirmation_prompt: Any,
    begin_run_pending_confirmation: Any,
    create_run: Any,
    load_created_run: Any = None,
    now_iso: Any = None,
) -> PreparedRunCreationServices:
    return PreparedRunCreationServices(
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=compute_tool_policy_precheck,
        apply_browser_execution_metadata=apply_browser_execution_metadata,
        local_execution_block_prompt=local_execution_block_prompt,
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        local_execution_requires_start_confirmation=local_execution_requires_start_confirmation,
        mark_local_execution_tools_approved=mark_local_execution_tools_approved,
        precheck_human_action_labels=precheck_human_action_labels,
        local_execution_confirmation_prompt=local_execution_confirmation_prompt,
        begin_run_pending_confirmation=begin_run_pending_confirmation,
        create_run=create_run,
        load_created_run=load_created_run,
        now_iso=now_iso,
    )


def build_legacy_local_execution_creation_services(
    *,
    callbacks: LegacyLocalExecutionCreationCallbacks,
) -> PreparedRunCreationServices:
    return build_prepared_run_creation_services(
        decide_execution_target=callbacks.decide_execution_target,
        apply_execution_route_metadata=callbacks.apply_execution_route_metadata,
        build_doctor_run_gate=callbacks.build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=callbacks.agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=callbacks.compute_tool_policy_precheck,
        apply_browser_execution_metadata=apply_browser_execution_metadata,
        local_execution_block_prompt=local_execution_block_prompt,
        resolve_runtime_policy_mode=callbacks.resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=callbacks.agent_machine_full_trust_enabled,
        local_execution_requires_start_confirmation=lambda metadata, precheck: local_execution_requires_start_confirmation(
            metadata,
            precheck,
            local_execution_target=callbacks.local_execution_target,
            local_execution_pack_id=callbacks.local_execution_pack_id,
        ),
        mark_local_execution_tools_approved=mark_local_execution_tools_approved,
        precheck_human_action_labels=precheck_human_action_labels,
        local_execution_confirmation_prompt=local_execution_confirmation_prompt,
        begin_run_pending_confirmation=callbacks.begin_run_pending_confirmation,
        create_run=callbacks.create_run,
        load_created_run=callbacks.load_created_run,
        now_iso=callbacks.now_iso,
    )


def build_legacy_run_request_services(
    *,
    prepare_run_start_request: Any,
    callbacks: LegacyLocalExecutionCreationCallbacks,
    result_services: RunPreparedResultServices,
) -> LegacyRunRequestServices:
    return LegacyRunRequestServices(
        prepare_run_start_request=prepare_run_start_request,
        build_creation_services=lambda: build_legacy_local_execution_creation_services(callbacks=callbacks),
        result_services=result_services,
    )


def build_legacy_run_request_services_from_values(
    *,
    prepare_run_start_request: Any,
    decide_execution_target: Callable[..., dict[str, Any]],
    apply_execution_route_metadata: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_doctor_run_gate: Callable[..., dict[str, Any]],
    agent_machine_inherited_owner_user_id: Callable[[Any], Any],
    compute_tool_policy_precheck: Callable[[dict[str, Any]], dict[str, Any]],
    resolve_runtime_policy_mode: Callable[..., dict[str, Any]],
    agent_machine_full_trust_enabled: Callable[[Any], bool],
    begin_run_pending_confirmation: Callable[..., dict[str, Any]],
    create_run: Callable[..., str],
    local_execution_target: str,
    local_execution_pack_id: str,
    result_services: RunPreparedResultServices,
    load_created_run: Optional[Callable[[str], dict[str, Any]]] = None,
    now_iso: Optional[Callable[[], str]] = None,
) -> LegacyRunRequestServices:
    return build_legacy_run_request_services(
        prepare_run_start_request=prepare_run_start_request,
        callbacks=LegacyLocalExecutionCreationCallbacks(
            decide_execution_target=decide_execution_target,
            apply_execution_route_metadata=apply_execution_route_metadata,
            build_doctor_run_gate=build_doctor_run_gate,
            agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
            compute_tool_policy_precheck=compute_tool_policy_precheck,
            resolve_runtime_policy_mode=resolve_runtime_policy_mode,
            agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
            begin_run_pending_confirmation=begin_run_pending_confirmation,
            create_run=create_run,
            local_execution_target=local_execution_target,
            local_execution_pack_id=local_execution_pack_id,
            load_created_run=load_created_run,
            now_iso=now_iso,
        ),
        result_services=result_services,
    )


def build_runs_core_creation_result(
    req: RunStartRequest,
    *,
    created: Dict[str, Any],
) -> Dict[str, Any]:
    metadata = created["metadata"]
    created_run = created["created_run"]
    return {
        "run_id": created["run_id"],
        "engine": created["engine"],
        "status": created["status"],
        "active_profile_id": created_run.get("active_profile_id"),
        "active_profile_label": created_run.get("active_profile_label"),
        "active_profile_provider": created_run.get("active_provider"),
        "active_profile_model": created_run.get("active_model"),
        "requested_provider": str(req.provider or "").strip().lower() or None,
        "requested_model": str(req.model or "").strip() or None,
        "policy_mode": metadata.get("policy_mode"),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": created["route"],
        "doctor_preflight": created["doctor_preflight"],
        "pending_approval": created["pending_confirmation"],
    }


def build_runs_delegation_creation_result(
    *,
    created: Dict[str, Any],
) -> Dict[str, Any]:
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
        "pending_approval": created["pending_confirmation"],
    }


def build_runs_core_result_services() -> RunPreparedResultServices:
    return build_run_prepared_result_services(
        create_run_from_prepared_request=create_run_from_prepared_request,
        build_result=lambda request, *, created: build_runs_core_creation_result(request, created=created),
    )


def build_runs_delegation_result_services() -> RunPreparedResultServices:
    return build_run_prepared_result_services(
        create_run_from_prepared_request=create_run_from_prepared_request,
        build_result=lambda _request, *, created: build_runs_delegation_creation_result(created=created),
    )


def build_runs_core_legacy_request_services(
    *,
    prepare_run_start_request: Any,
    decide_execution_target: Callable[..., dict[str, Any]],
    apply_execution_route_metadata: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_doctor_run_gate: Callable[..., dict[str, Any]],
    agent_machine_inherited_owner_user_id: Callable[[Any], Any],
    compute_tool_policy_precheck: Callable[[dict[str, Any]], dict[str, Any]],
    resolve_runtime_policy_mode: Callable[..., dict[str, Any]],
    agent_machine_full_trust_enabled: Callable[[Any], bool],
    begin_run_pending_confirmation: Callable[..., dict[str, Any]],
    create_run: Callable[..., str],
    local_execution_target: str,
    local_execution_pack_id: str,
    load_created_run: Optional[Callable[[str], dict[str, Any]]] = None,
    now_iso: Optional[Callable[[], str]] = None,
) -> LegacyRunRequestServices:
    return build_legacy_run_request_services_from_values(
        prepare_run_start_request=prepare_run_start_request,
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=compute_tool_policy_precheck,
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        begin_run_pending_confirmation=begin_run_pending_confirmation,
        create_run=create_run,
        local_execution_target=local_execution_target,
        local_execution_pack_id=local_execution_pack_id,
        result_services=build_runs_core_result_services(),
        load_created_run=load_created_run,
        now_iso=now_iso,
    )


def build_runs_delegation_legacy_request_services(
    *,
    prepare_run_start_request: Any,
    decide_execution_target: Callable[..., dict[str, Any]],
    apply_execution_route_metadata: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_doctor_run_gate: Callable[..., dict[str, Any]],
    agent_machine_inherited_owner_user_id: Callable[[Any], Any],
    compute_tool_policy_precheck: Callable[[dict[str, Any]], dict[str, Any]],
    resolve_runtime_policy_mode: Callable[..., dict[str, Any]],
    agent_machine_full_trust_enabled: Callable[[Any], bool],
    begin_run_pending_confirmation: Callable[..., dict[str, Any]],
    create_run: Callable[..., str],
    local_execution_target: str,
    local_execution_pack_id: str,
    now_iso: Optional[Callable[[], str]] = None,
) -> LegacyRunRequestServices:
    return build_legacy_run_request_services_from_values(
        prepare_run_start_request=prepare_run_start_request,
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=compute_tool_policy_precheck,
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        begin_run_pending_confirmation=begin_run_pending_confirmation,
        create_run=create_run,
        local_execution_target=local_execution_target,
        local_execution_pack_id=local_execution_pack_id,
        result_services=build_runs_delegation_result_services(),
        now_iso=now_iso,
    )


def _resolve_namespace_callable(
    namespace: Dict[str, Any],
    *names: str,
    fallback_loader: Optional[Callable[[], Any]] = None,
) -> Any:
    for name in names:
        candidate = namespace.get(name)
        if callable(candidate):
            return candidate
    if fallback_loader is not None:
        return fallback_loader()
    for name in names:
        candidate = namespace.get(name)
        if candidate is not None:
            return candidate
    return None


def build_runs_delegation_runtime_request_services_from_namespace(
    *,
    namespace: Dict[str, Any],
    prepare_run_start_request: Any,
    decide_execution_target: Callable[..., dict[str, Any]],
    apply_execution_route_metadata: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_doctor_run_gate: Callable[..., dict[str, Any]],
    agent_machine_inherited_owner_user_id: Callable[[Any], Any],
    resolve_runtime_policy_mode: Callable[..., dict[str, Any]],
    agent_machine_full_trust_enabled: Callable[[Any], bool],
    local_execution_target: str,
    local_execution_pack_id: str,
    now_iso: Optional[Callable[[], str]] = None,
    compute_tool_policy_precheck_fallback: Optional[Callable[[], Any]] = None,
    create_run_fallback: Optional[Callable[[], Any]] = None,
    begin_run_pending_confirmation_fallback: Optional[Callable[[], Any]] = None,
) -> LegacyRunRequestServices:
    return build_runs_delegation_legacy_request_services(
        prepare_run_start_request=prepare_run_start_request,
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=_resolve_namespace_callable(
            namespace,
            "_compute_tool_policy_precheck",
            fallback_loader=compute_tool_policy_precheck_fallback,
        ),
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        begin_run_pending_confirmation=_resolve_namespace_callable(
            namespace,
            "_begin_run_pending_confirmation",
            "_begin_run_pending_approval",
            fallback_loader=begin_run_pending_confirmation_fallback,
        ),
        create_run=_resolve_namespace_callable(
            namespace,
            "create_run",
            fallback_loader=create_run_fallback,
        ),
        local_execution_target=local_execution_target,
        local_execution_pack_id=local_execution_pack_id,
        now_iso=now_iso,
    )


def build_runs_core_runtime_request_services_from_namespace(
    *,
    namespace: Dict[str, Any],
    prepare_run_start_request: Any,
    decide_execution_target: Callable[..., dict[str, Any]],
    apply_execution_route_metadata: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_doctor_run_gate: Callable[..., dict[str, Any]],
    agent_machine_inherited_owner_user_id: Callable[[Any], Any],
    resolve_runtime_policy_mode: Callable[..., dict[str, Any]],
    agent_machine_full_trust_enabled: Callable[[Any], bool],
    local_execution_target: str,
    local_execution_pack_id: str,
    load_created_run: Optional[Callable[[str], dict[str, Any]]] = None,
    now_iso: Optional[Callable[[], str]] = None,
    compute_tool_policy_precheck_fallback: Optional[Callable[[], Any]] = None,
    create_run_fallback: Optional[Callable[[], Any]] = None,
    begin_run_pending_confirmation_fallback: Optional[Callable[[], Any]] = None,
) -> LegacyRunRequestServices:
    return build_runs_core_legacy_request_services(
        prepare_run_start_request=prepare_run_start_request,
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=_resolve_namespace_callable(
            namespace,
            "_compute_tool_policy_precheck",
            fallback_loader=compute_tool_policy_precheck_fallback,
        ),
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        begin_run_pending_confirmation=_resolve_namespace_callable(
            namespace,
            "_begin_run_pending_confirmation",
            fallback_loader=begin_run_pending_confirmation_fallback,
        ),
        create_run=_resolve_namespace_callable(
            namespace,
            "create_run",
            fallback_loader=create_run_fallback,
        ),
        local_execution_target=local_execution_target,
        local_execution_pack_id=local_execution_pack_id,
        load_created_run=load_created_run,
        now_iso=now_iso,
    )


def build_runs_core_legacy_preparation_services(
    *,
    engine_registry: dict[str, Any],
    engine_validation_errors: list[str],
    supported_outcome_packs: set[str],
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    normalize_trust_mode: Callable[[Any], str],
    trust_mode_aliases: dict[str, str],
    valid_trust_modes: set[str],
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: set[str],
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    detect_agent_role: Callable[[RunStartRequest, dict[str, Any]], tuple[str, str]],
    resolve_app_permissions: Callable[[Any], dict[str, Any]],
    action_policy_from_app_permissions: Callable[[dict[str, Any]], dict[str, Any]],
    merge_action_policies: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Optional[dict[str, Any]]],
    postprocess_metadata: Optional[Callable[[dict[str, Any], RunStartRequest], dict[str, Any]]] = None,
) -> LegacyRunPreparationServices:
    return build_legacy_run_preparation_services_from_values(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=normalize_requested_max_iterations,
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=normalize_run_id_token,
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=detect_agent_role,
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
        postprocess_metadata=postprocess_metadata,
    )


def build_runs_core_runtime_preparation_services_from_namespace(
    *,
    namespace: Dict[str, Any],
    engine_registry: dict[str, Any],
    engine_validation_errors: list[str],
    supported_outcome_packs: set[str],
    normalize_trust_mode: Callable[[Any], str],
    trust_mode_aliases: dict[str, str],
    valid_trust_modes: set[str],
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: set[str],
    normalize_agent_role: Callable[[Any], str],
    resolve_app_permissions: Callable[[Any], dict[str, Any]],
    action_policy_from_app_permissions: Callable[[dict[str, Any]], dict[str, Any]],
    merge_action_policies: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Optional[dict[str, Any]]],
) -> LegacyRunPreparationServices:
    return build_runs_core_legacy_preparation_services(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=_resolve_namespace_callable(
            namespace,
            "_normalize_requested_max_iterations",
        ),
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=_resolve_namespace_callable(
            namespace,
            "_normalize_run_id_token",
        ),
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=_resolve_namespace_callable(
            namespace,
            "_detect_agent_role",
        ),
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
        postprocess_metadata=_resolve_namespace_callable(
            namespace,
            "_bind_obvious_connector_write_intent",
        ),
    )


def build_runs_delegation_legacy_preparation_services(
    *,
    engine_registry: dict[str, Any],
    engine_validation_errors: list[str],
    supported_outcome_packs: set[str],
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    normalize_trust_mode: Callable[[Any], str],
    trust_mode_aliases: dict[str, str],
    valid_trust_modes: set[str],
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: set[str],
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    detect_agent_role: Callable[[RunStartRequest, dict[str, Any]], tuple[str, str]],
    resolve_app_permissions: Callable[[Any], dict[str, Any]],
    action_policy_from_app_permissions: Callable[[dict[str, Any]], dict[str, Any]],
    merge_action_policies: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Optional[dict[str, Any]]],
) -> LegacyRunPreparationServices:
    return build_legacy_run_preparation_services_from_values(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=normalize_requested_max_iterations,
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=normalize_run_id_token,
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=detect_agent_role,
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
    )


def build_runs_delegation_runtime_preparation_services_from_namespace(
    *,
    namespace: Dict[str, Any],
    engine_registry: dict[str, Any],
    engine_validation_errors: list[str],
    supported_outcome_packs: set[str],
    normalize_trust_mode: Callable[[Any], str],
    trust_mode_aliases: dict[str, str],
    valid_trust_modes: set[str],
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: set[str],
    normalize_agent_role: Callable[[Any], str],
    resolve_app_permissions: Callable[[Any], dict[str, Any]],
    action_policy_from_app_permissions: Callable[[dict[str, Any]], dict[str, Any]],
    merge_action_policies: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Optional[dict[str, Any]]],
) -> LegacyRunPreparationServices:
    return build_runs_delegation_legacy_preparation_services(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=_resolve_namespace_callable(
            namespace,
            "_normalize_requested_max_iterations",
        ),
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=_resolve_namespace_callable(
            namespace,
            "_normalize_run_id_token",
        ),
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=_resolve_namespace_callable(
            namespace,
            "_detect_agent_role",
        ),
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
    )


def build_schedule_bound_create_run_from_request(
    create_run_from_request: Callable[..., Any],
    *,
    schedule_id: Optional[str] = None,
) -> Callable[[Any], Any]:
    if schedule_id is None:
        return lambda req: create_run_from_request(req)
    return lambda req: create_run_from_request(req, schedule_id=schedule_id)


def is_valid_run_state(value: str) -> bool:
    return value in RUN_STATES


def validate_transition(transition: RunTransition) -> None:
    if not is_valid_run_state(transition.from_state):
        raise ValueError(f"Unknown from_state '{transition.from_state}'.")
    if not is_valid_run_state(transition.to_state):
        raise ValueError(f"Unknown to_state '{transition.to_state}'.")


def initial_run_record(run_id: str, tenant_id: str, workspace_id: str, **metadata: Any) -> RunRecord:
    return RunRecord(run_id=run_id, tenant_id=tenant_id, workspace_id=workspace_id, metadata=dict(metadata))


def _metadata_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _hint_text(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def _hint_list(value: Any) -> Optional[List[dict]]:
    return list(value) if isinstance(value, list) else None


def build_run_preview_context(
    req: RunStartRequest,
    *,
    metadata: Dict[str, Any],
    workflow_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "workflow_id": req.workflow_id,
        "workspace_id": req.workspace_id,
        "user_goal": req.user_goal,
        "business_plan": req.business_plan,
        "max_iterations": getattr(req, "max_iterations", None),
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


def build_run_routing_preview(
    req: RunStartRequest,
    *,
    services: RunRoutingPreviewServices,
) -> Dict[str, Any]:
    prepared = services.prepare_run_start_request(req)
    metadata = dict(prepared["metadata"])
    workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
    route = decide_execution_target(metadata)
    metadata = apply_execution_route_metadata(metadata, route)
    preview_context = build_run_preview_context(
        req,
        metadata=metadata,
        workflow_snapshot=workflow_snapshot,
    )
    return {
        "engine": prepared["engine"],
        "metadata": metadata,
        "route": route,
        "tool_policy_precheck": services.compute_tool_policy_precheck(preview_context),
        "workflow_snapshot": workflow_snapshot,
    }


async def build_run_precheck_result(
    req: RunStartRequest,
    *,
    services: RunRoutingPreviewServices,
) -> Dict[str, Any]:
    preview = build_run_routing_preview(req, services=services)
    doctor_preflight = await build_doctor_run_gate_live(
        execution_target=preview["route"]["selected"],
        metadata=preview["metadata"],
        provider=req.provider,
        credential_id=req.credential_id,
    )
    return {
        **preview,
        "doctor_preflight": doctor_preflight,
    }


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def normalize_requested_max_iterations(value: Any) -> Optional[int]:
    if value in {None, ""}:
        return None
    parsed = safe_int(value, 0)
    if parsed <= 0:
        raise HTTPException(status_code=400, detail="max_iterations must be greater than zero.")
    return parsed


def local_execution_requires_start_confirmation(
    metadata: Dict[str, Any],
    precheck: Dict[str, Any],
    *,
    local_execution_target: str,
    local_execution_pack_id: str,
) -> bool:
    target = str(metadata.get("execution_target_selected") or metadata.get("execution_target") or "").strip().lower()
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if target != local_execution_target:
        return False
    if outcome_pack != local_execution_pack_id:
        return False
    return bool(precheck.get("require_confirmation_count") or precheck.get("approval_required_count"))


def precheck_human_action_labels(precheck: Dict[str, Any], decision: str = "require_confirmation") -> List[str]:
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    labels: List[str] = []
    seen: set[str] = set()
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
        raw_label = capability_labels[0] if capability_labels else str(item.get("tool_id") or "").strip().replace("_", " ")
        clean = raw_label.strip()
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            labels.append(clean)
    return labels


def local_execution_confirmation_prompt(precheck: Dict[str, Any]) -> str:
    labels = precheck_human_action_labels(precheck, decision="require_confirmation")
    if labels:
        return f"Confirmation required before local companion execution: {', '.join(labels)}."
    return "Confirmation required before local companion execution."


def local_execution_block_prompt(precheck: Dict[str, Any]) -> str:
    labels = precheck_human_action_labels(precheck, decision="deny")
    if labels:
        return f"Run blocked by local execution policy: {', '.join(labels)}."
    return "Run blocked by local execution policy."


def mark_local_execution_tools_approved(metadata: Dict[str, Any]) -> None:
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


def apply_browser_execution_metadata(metadata: Dict[str, Any]) -> None:
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


def build_run_start_request_from_turn(
    turn_request: AgentTurnRequest,
    *,
    base_request: Optional[Any] = None,
) -> RunStartRequest:
    base = base_request if isinstance(base_request, RunStartRequest) else RunStartRequest()
    base_metadata = _metadata_dict(getattr(base, "metadata", None))
    hint_metadata = _metadata_dict(turn_request.context_hints.get("metadata"))
    metadata = {**hint_metadata, **base_metadata}
    metadata = bind_agent_turn_metadata(metadata, turn_request, source="runs/start")
    if turn_request.policy_context:
        metadata["policy_context"] = dict(turn_request.policy_context)
    if turn_request.machine_target and not _hint_text(metadata.get("machine_target")):
        metadata["machine_target"] = str(turn_request.machine_target).strip()
    if not _hint_text(metadata.get("channel")):
        metadata["channel"] = str(turn_request.channel or "").strip() or "web"
    if not _hint_text(metadata.get("session_id")):
        metadata["session_id"] = str(turn_request.session_id or "").strip()

    return RunStartRequest(
        engine=_hint_text(getattr(base, "engine", None)) or _hint_text(turn_request.context_hints.get("engine")) or "orion",
        workflow_id=_hint_text(getattr(base, "workflow_id", None)) or _hint_text(turn_request.context_hints.get("workflow_id")),
        workspace_id=str(turn_request.workspace_id or getattr(base, "workspace_id", None) or "default").strip() or "default",
        user_goal=_hint_text(turn_request.message) or _hint_text(getattr(base, "user_goal", None)),
        business_plan=_hint_text(getattr(base, "business_plan", None)),
        max_iterations=(
            getattr(base, "max_iterations", None)
            if getattr(base, "max_iterations", None) is not None
            else turn_request.context_hints.get("max_iterations")
        ),
        agent_role=_hint_text(getattr(base, "agent_role", None)) or _hint_text(turn_request.context_hints.get("agent_role")),
        parent_run_id=_hint_text(getattr(base, "parent_run_id", None)) or _hint_text(metadata.get("parent_run_id")),
        provider=_hint_text(getattr(base, "provider", None)) or _hint_text(turn_request.context_hints.get("provider")),
        model=_hint_text(getattr(base, "model", None)) or _hint_text(turn_request.context_hints.get("model")),
        credential_id=_hint_text(getattr(base, "credential_id", None)) or _hint_text(turn_request.context_hints.get("credential_id")),
        agents=_hint_list(getattr(base, "agents", None)),
        metadata=metadata,
    )


def prepare_run_start_request(
    req: RunStartRequest,
    *,
    services: RunPreparationServices,
) -> Dict[str, Any]:
    engine = (req.engine or "orion").lower().strip()
    metadata = dict(req.metadata) if isinstance(req.metadata, dict) else {}
    normalized_max_iterations = services.normalize_requested_max_iterations(getattr(req, "max_iterations", None))
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if engine not in services.engine_registry:
        raise HTTPException(status_code=400, detail=f"Unsupported engine '{engine}'")
    if engine == "orion" and services.engine_validation_errors:
        raise HTTPException(status_code=503, detail="Empyralis runtime validation failed.")
    if engine == "orion" and outcome_pack and outcome_pack not in services.supported_outcome_packs:
        raise HTTPException(status_code=400, detail=f"Unsupported outcome pack '{outcome_pack}'")

    if engine == "orion":
        raw_trust_mode = str(metadata.get("trust_mode") or "").strip().lower()
        normalized_trust_mode = services.normalize_trust_mode(raw_trust_mode)
        if (
            raw_trust_mode
            and raw_trust_mode not in services.trust_mode_aliases
            and raw_trust_mode not in services.valid_trust_modes
        ):
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
            normalized_target = services.normalize_execution_target(metadata.get("execution_target"))
            if normalized_target not in services.valid_execution_targets:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported execution_target. Use one of: auto, cloud, local_companion.",
                )
            metadata["execution_target"] = normalized_target

    if normalized_max_iterations is not None:
        metadata["max_iterations"] = normalized_max_iterations
    else:
        metadata.pop("max_iterations", None)

    parent_run_id = services.normalize_run_id_token(req.parent_run_id or metadata.get("parent_run_id"))
    if parent_run_id:
        metadata["parent_run_id"] = parent_run_id
    elif "parent_run_id" in metadata:
        metadata.pop("parent_run_id", None)

    delegation_root_run_id = services.normalize_run_id_token(metadata.get("delegation_root_run_id"))
    if delegation_root_run_id:
        metadata["delegation_root_run_id"] = delegation_root_run_id
    elif "delegation_root_run_id" in metadata:
        metadata.pop("delegation_root_run_id", None)

    delegated_by_run_id = services.normalize_run_id_token(metadata.get("delegated_by_run_id"))
    if delegated_by_run_id:
        metadata["delegated_by_run_id"] = delegated_by_run_id
    elif "delegated_by_run_id" in metadata:
        metadata.pop("delegated_by_run_id", None)

    delegated_by_role = services.normalize_agent_role(metadata.get("delegated_by_role"))
    if delegated_by_role:
        metadata["delegated_by_role"] = delegated_by_role
    elif "delegated_by_role" in metadata:
        metadata.pop("delegated_by_role", None)

    agent_role, agent_role_source = services.detect_agent_role(req, metadata)
    metadata["agent_role"] = agent_role
    metadata["agent_role_source"] = agent_role_source

    app_id = str(metadata.get("app_id") or "").strip()
    if app_id:
        app_permissions = services.resolve_app_permissions(app_id)
        metadata["app_id"] = app_id
        metadata["app_permissions"] = app_permissions
        app_policy = services.action_policy_from_app_permissions(app_permissions)
        existing_policy = metadata.get("action_policy") if isinstance(metadata.get("action_policy"), dict) else {}
        metadata["action_policy"] = services.merge_action_policies(
            {"action_policy": existing_policy},
            {"action_policy": app_policy},
        )

    workflow_snapshot = None
    if str(req.workflow_id or "").strip():
        workflow_snapshot = services.fetch_workflow_snapshot(req.workflow_id)
        if isinstance(workflow_snapshot, dict):
            metadata["workflow_schema_version"] = str(
                workflow_snapshot.get("definition", {}).get("version") or ""
            ).strip() or None
            if workflow_snapshot.get("name") and "workflow_name" not in metadata:
                metadata["workflow_name"] = workflow_snapshot.get("name")
            if workflow_snapshot.get("status"):
                metadata["workflow_status"] = workflow_snapshot.get("status")

    if callable(services.postprocess_metadata):
        metadata = services.postprocess_metadata(req, metadata)

    return {
        "engine": engine,
        "metadata": metadata,
        "workflow_snapshot": workflow_snapshot,
    }


def prepare_legacy_run_start_request(
    request: RunStartRequest,
    *,
    services: LegacyRunPreparationServices,
) -> Dict[str, Any]:
    preparation_services = services.build_preparation_services()
    return prepare_run_start_request(request, services=preparation_services)


def create_run_result_from_request(
    request: RunStartRequest,
    *,
    services: RunCreationServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    if schedule_id is not None:
        result = services.create_run_from_request(request, schedule_id=schedule_id)
    else:
        result = services.create_run_from_request(request)
    return dict(result) if isinstance(result, dict) else {"result": result}


def build_run_prepared_result_services(
    *,
    create_run_from_prepared_request: Any,
    build_result: Any,
) -> RunPreparedResultServices:
    return RunPreparedResultServices(
        create_run_from_prepared_request=create_run_from_prepared_request,
        build_result=build_result,
    )


def create_run_result_from_prepared_request(
    request: RunStartRequest,
    *,
    prepared: Dict[str, Any],
    services: PreparedRunCreationServices,
    result_services: RunPreparedResultServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    created = result_services.create_run_from_prepared_request(
        request,
        prepared=prepared,
        services=services,
        schedule_id=schedule_id,
    )
    result = result_services.build_result(request, created=created)
    return dict(result) if isinstance(result, dict) else {"result": result}


def create_legacy_run_result_from_request(
    request: RunStartRequest,
    *,
    services: LegacyRunRequestServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    prepared = services.prepare_run_start_request(request)
    creation_services = services.build_creation_services()
    return create_run_result_from_prepared_request(
        request,
        prepared=prepared,
        services=creation_services,
        result_services=services.result_services,
        schedule_id=schedule_id,
    )


def build_delegated_child_run_request(
    parent_snapshot: Dict[str, Any],
    child_payload: Dict[str, Any],
    *,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    valid_execution_targets: Any,
    note: Optional[str] = None,
) -> RunStartRequest:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    if not isinstance(parent_metadata, dict):
        parent_metadata = {}
    child_metadata = dict(child_payload.get("metadata") or {})
    parent_run_id = str(parent_snapshot.get("run_id") or "").strip()
    root_run_id = normalize_run_id_token(
        parent_snapshot.get("delegation_root_run_id") or parent_metadata.get("delegation_root_run_id")
    ) or parent_run_id
    delegated_by_role = normalize_agent_role(
        parent_snapshot.get("agent_role") or parent_metadata.get("agent_role")
    ) or "orchestrator"

    child_metadata["parent_run_id"] = parent_run_id
    child_metadata["delegation_root_run_id"] = root_run_id
    child_metadata["delegated_by_run_id"] = parent_run_id
    child_metadata["delegated_by_role"] = delegated_by_role
    if note:
        child_metadata["delegation_note"] = note
    selected_target = str(
        parent_metadata.get("execution_target_selected") or parent_metadata.get("execution_target") or ""
    ).strip().lower()
    if selected_target in valid_execution_targets and "execution_target" not in child_metadata:
        child_metadata["execution_target"] = selected_target
    if parent_metadata.get("trust_mode") and "trust_mode" not in child_metadata:
        child_metadata["trust_mode"] = parent_metadata.get("trust_mode")

    return RunStartRequest(
        engine=str(parent_snapshot.get("engine") or "orion"),
        workflow_id=parent_context.get("workflow_id"),
        workspace_id=parent_context.get("workspace_id"),
        user_goal=str(child_payload.get("user_goal") or "").strip(),
        business_plan=str(
            child_payload.get("business_plan") or parent_context.get("business_plan") or ""
        ).strip()
        or None,
        max_iterations=normalize_requested_max_iterations(
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


def timeout_stale_delegated_child_runs(
    parent_run_id: str,
    child_runs: List[Dict[str, Any]],
    *,
    runs_by_id: Dict[str, Any],
    terminal_run_statuses: Any,
    stale_child_run_timeout_seconds: int,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    set_run_status: Callable[[str, str], Any],
    emit_log: Callable[..., Any],
) -> List[str]:
    now = utc_now()
    timed_out: List[str] = []
    for child in child_runs:
        status = str(child.get("status") or "").strip().lower()
        if not status or status in terminal_run_statuses or status in {"waiting", "waiting_for_input"}:
            continue
        run_id = normalize_run_id_token(child.get("run_id"))
        if not run_id:
            run_id = str(child.get("run_id") or "").strip() or None
        if not run_id:
            continue
        last_progress = (
            parse_utc_ts(child.get("local_last_progress_at"))
            or parse_utc_ts(child.get("local_last_heartbeat_at"))
            or parse_utc_ts(child.get("updated_at"))
            or parse_utc_ts(child.get("created_at"))
        )
        if last_progress is None or (now - last_progress).total_seconds() <= stale_child_run_timeout_seconds:
            continue
        live_child = runs_by_id.get(run_id)
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
        set_run_status(run_id, "failed")
        timed_out.append(run_id)
    return timed_out


def build_retry_child_payload(
    parent_snapshot: Dict[str, Any],
    child_snapshot: Dict[str, Any],
    *,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    child_retry_count: Callable[[Dict[str, Any]], int],
    note: Optional[str] = None,
) -> Dict[str, Any]:
    child_context = child_snapshot.get("context") if isinstance(child_snapshot.get("context"), dict) else {}
    child_metadata = child_context.get("metadata") if isinstance(child_context.get("metadata"), dict) else {}
    if not isinstance(child_metadata, dict):
        child_metadata = {}
    retry_root_run_id = normalize_run_id_token(child_metadata.get("retry_root_run_id")) or normalize_run_id_token(
        child_snapshot.get("run_id")
    )
    retry_sequence = int(child_metadata.get("retry_sequence") or 0) + 1
    next_metadata = dict(child_metadata)
    next_metadata["retry_of_run_id"] = str(child_snapshot.get("run_id") or "").strip()
    next_metadata["retry_root_run_id"] = retry_root_run_id
    next_metadata["retry_sequence"] = retry_sequence
    next_metadata["retry_count"] = child_retry_count(child_snapshot) + 1
    if note:
        next_metadata["delegation_retry_note"] = note
    return {
        "agent_role": normalize_agent_role(child_snapshot.get("agent_role") or child_metadata.get("agent_role"))
        or str(child_snapshot.get("agent_role") or "").strip(),
        "user_goal": str(child_context.get("user_goal") or child_snapshot.get("user_goal") or "").strip(),
        "business_plan": str(child_context.get("business_plan") or "").strip() or None,
        "max_iterations": normalize_requested_max_iterations(
            child_context.get("max_iterations") or child_metadata.get("max_iterations")
        ),
        "metadata": next_metadata,
    }


def schedule_auto_retry_for_failed_children(
    parent_snapshot: Dict[str, Any],
    child_runs: List[Dict[str, Any]],
    *,
    runs_by_id: Dict[str, Any],
    parse_utc_ts: Callable[[Any], Any],
    child_lineage_key: Callable[[Dict[str, Any]], str],
    failure_status: Callable[[Any], bool],
    child_retry_count: Callable[[Dict[str, Any]], int],
    safe_int: Callable[[Any, int], int],
    auto_retry_pending: set,
    auto_retry_attempts: Dict[Any, Any],
    auto_retry_pending_lock: Any,
    auto_retry_max_retries: int,
    auto_retry_delay_seconds: float,
    emit_log: Callable[..., Any],
    build_retry_child_payload_fn: Callable[..., Dict[str, Any]],
    build_delegated_child_run_request_fn: Callable[..., RunStartRequest],
    execute_delegated_run_request_fn: Callable[[RunStartRequest], Dict[str, Any]],
    lookup_run_snapshot_fn: Callable[[str], Dict[str, Any]],
    find_run_relationships_fn: Callable[[str, Dict[str, Any]], Any],
    refresh_parent_delegation_state_fn: Callable[..., Any],
    timer_factory: Callable[..., Any],
    triggering_run_id: Optional[str] = None,
) -> set[str]:
    from datetime import datetime, timezone

    parent_run_id = str(parent_snapshot.get("run_id") or "").strip()
    if not parent_run_id:
        return set()

    latest_by_lineage: Dict[str, Dict[str, Any]] = {}
    for child in child_runs:
        lineage_key = child_lineage_key(child)
        previous = latest_by_lineage.get(lineage_key)
        child_sort_key = (
            parse_utc_ts(child.get("updated_at")) or parse_utc_ts(child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(child.get("run_id") or ""),
        )
        previous_sort_key = (
            parse_utc_ts(previous.get("updated_at")) or parse_utc_ts(previous.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(previous.get("run_id") or ""),
        ) if isinstance(previous, dict) else None
        if previous_sort_key is None or child_sort_key > previous_sort_key:
            latest_by_lineage[lineage_key] = child

    scheduled: set[str] = set()
    live_parent = runs_by_id.get(parent_run_id)
    log_queue = live_parent.get("logs") if isinstance(live_parent, dict) else None

    for lineage_key, child in latest_by_lineage.items():
        status = str(child.get("status") or "").strip().lower()
        if not failure_status(status) or not lineage_key:
            continue
        with auto_retry_pending_lock:
            pending_key = (parent_run_id, lineage_key)
            retry_count = max(
                child_retry_count(child),
                safe_int(auto_retry_attempts.get(pending_key), 0),
            )
            if retry_count >= auto_retry_max_retries:
                continue
            if pending_key in auto_retry_pending:
                continue
            auto_retry_pending.add(pending_key)
            auto_retry_attempts[pending_key] = retry_count + 1
        child_run_id = str(child.get("run_id") or "").strip()
        scheduled.add(lineage_key)
        if log_queue is not None:
            emit_log(
                log_queue,
                "info",
                f"Child run {child_run_id} failed, retrying (attempt {retry_count + 2}/{auto_retry_max_retries + 1})...",
                event="delegation_retry",
                data={
                    "parent_run_id": parent_run_id,
                    "triggering_run_id": triggering_run_id,
                    "child_run_id": child_run_id,
                    "retry_count": retry_count + 1,
                },
            )

        def _retry_job(
            parent_id: str = parent_run_id,
            failed_child: Dict[str, Any] = dict(child),
            pending: tuple[str, str] = pending_key,
        ) -> None:
            try:
                current_parent_snapshot = lookup_run_snapshot_fn(parent_id)
                _, current_children = find_run_relationships_fn(parent_id, current_parent_snapshot)
                latest_for_lineage = None
                for current_child in current_children:
                    if child_lineage_key(current_child) != pending[1]:
                        continue
                    if latest_for_lineage is None:
                        latest_for_lineage = current_child
                        continue
                    current_sort_key = (
                        parse_utc_ts(current_child.get("updated_at")) or parse_utc_ts(current_child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                        str(current_child.get("run_id") or ""),
                    )
                    latest_sort_key = (
                        parse_utc_ts(latest_for_lineage.get("updated_at")) or parse_utc_ts(latest_for_lineage.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                        str(latest_for_lineage.get("run_id") or ""),
                    )
                    if current_sort_key > latest_sort_key:
                        latest_for_lineage = current_child
                if not isinstance(latest_for_lineage, dict):
                    return
                if str(latest_for_lineage.get("run_id") or "").strip() != str(failed_child.get("run_id") or "").strip():
                    return
                if not failure_status(latest_for_lineage.get("status")):
                    return
                retry_payload = build_retry_child_payload_fn(
                    current_parent_snapshot,
                    latest_for_lineage,
                    note="Automatic retry after delegated child failure.",
                )
                retry_metadata = retry_payload.get("metadata") if isinstance(retry_payload.get("metadata"), dict) else {}
                if isinstance(retry_metadata, dict):
                    retry_metadata["auto_retry"] = True
                    retry_payload["metadata"] = retry_metadata
                delegated_req = build_delegated_child_run_request_fn(
                    current_parent_snapshot,
                    retry_payload,
                    note="Automatic retry after delegated child failure.",
                )
                execute_delegated_run_request_fn(delegated_req)
            except Exception as exc:
                current_parent = runs_by_id.get(parent_id)
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
                with auto_retry_pending_lock:
                    auto_retry_pending.discard(pending)
                refresh_parent_delegation_state_fn(
                    parent_id,
                    triggering_run_id=str(failed_child.get("run_id") or "").strip() or None,
                )

        timer = timer_factory(auto_retry_delay_seconds, _retry_job)
        timer.daemon = True
        timer.start()

    return scheduled


def build_run_relation_summary(
    snapshot: Dict[str, Any],
    *,
    agent_workspace_labels: Dict[str, str],
) -> Dict[str, Any]:
    agent_role = str(snapshot.get("agent_role") or "").strip()
    return {
        "run_id": snapshot.get("run_id"),
        "status": snapshot.get("status"),
        "agent_role": snapshot.get("agent_role"),
        "agent_role_source": snapshot.get("agent_role_source"),
        "agent_label": (
            agent_workspace_labels.get(agent_role.lower(), agent_role) if agent_role else None
        ),
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


def iter_known_run_snapshots(
    *,
    runs_by_id: Dict[str, Any],
    run_history: List[Dict[str, Any]],
    serialize_run_snapshot_fn: Callable[[str, Dict[str, Any]], Dict[str, Any]],
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for run_id, run in list(runs_by_id.items()):
        if not isinstance(run, dict):
            continue
        snapshot = serialize_run_snapshot_fn(run_id, run)
        run_id_value = str(snapshot.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(snapshot)
    for item in run_history:
        if not isinstance(item, dict):
            continue
        run_id_value = str(item.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(item)
    return items


def find_run_relationships(
    target_run_id: str,
    snapshot: Dict[str, Any],
    *,
    extract_run_relationships_from_context_fn: Callable[[Dict[str, Any]], Dict[str, Optional[str]]],
    iter_known_run_snapshots_fn: Callable[[], List[Dict[str, Any]]],
    normalize_run_id_token: Callable[[Any], Optional[str]],
    build_run_relation_summary_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    parse_utc_ts: Callable[[Any], Any],
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    from datetime import datetime, timezone

    context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
    relationships = extract_run_relationships_from_context_fn(context) if isinstance(context, dict) else {}
    parent_run_id = relationships.get("parent_run_id")
    parent_summary: Optional[Dict[str, Any]] = None
    child_summaries: List[Dict[str, Any]] = []
    for candidate in iter_known_run_snapshots_fn():
        candidate_run_id = str(candidate.get("run_id") or "").strip()
        if not candidate_run_id or candidate_run_id == target_run_id:
            continue
        candidate_parent_run_id = normalize_run_id_token(candidate.get("parent_run_id"))
        if candidate_parent_run_id == target_run_id:
            child_summaries.append(build_run_relation_summary_fn(candidate))
        if parent_run_id and candidate_run_id == parent_run_id:
            parent_summary = build_run_relation_summary_fn(candidate)
    child_summaries.sort(
        key=lambda item: (
            parse_utc_ts(item.get("updated_at"))
            or parse_utc_ts(item.get("created_at"))
            or datetime.min.replace(tzinfo=timezone.utc),
            str(item.get("run_id") or ""),
        ),
        reverse=True,
    )
    return parent_summary, child_summaries


def llm_auto_delegate_role(
    *,
    objective: str,
    business_plan: Optional[str],
    parent_snapshot: Dict[str, Any],
    routing_role_rules: Dict[str, Dict[str, Any]],
    normalize_agent_role: Callable[[Any], str],
    llm_task_fn: Callable[..., Any],
    routing_context: Optional[Dict[str, str]],
) -> Optional[Dict[str, str]]:
    if not isinstance(routing_context, dict):
        return None

    agent_list_lines = [
        f"- {role}: {str(rule.get('reason') or '').strip() or str(rule.get('goal') or '').strip()}"
        for role, rule in routing_role_rules.items()
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
    result = llm_task_fn(
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


def emit_auto_delegation_routing_log(
    parent_run_id: str,
    plan: List[Dict[str, Any]],
    *,
    runs_by_id: Dict[str, Any],
    emit_log_fn: Callable[..., Any],
    strategy: str,
    reason: str = "",
) -> None:
    run = runs_by_id.get(parent_run_id)
    if not isinstance(run, dict):
        return
    log_queue = run.get("logs")
    if log_queue is None:
        return
    emit_log_fn(
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


def build_auto_delegation_plan(
    parent_snapshot: Dict[str, Any],
    *,
    max_children: int = 3,
    routing_role_rules: Dict[str, Dict[str, Any]],
    normalize_agent_role: Callable[[Any], str],
    llm_auto_delegate_role_fn: Callable[..., Optional[Dict[str, str]]],
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
        llm_route = llm_auto_delegate_role_fn(
            objective=objective,
            business_plan=business_plan,
            parent_snapshot=parent_snapshot,
        )
    except Exception:
        llm_route = None

    scored: List[Tuple[int, str, Dict[str, Any]]] = []
    for role, rule in routing_role_rules.items():
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
        llm_rule = routing_role_rules.get(llm_role or "")
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
        chosen.append(("research", routing_role_rules["research"]))
        if len(chosen) < max_children and any(term in combined for term in ("build", "implement", "fix", "platform", "app", "automation")):
            chosen.append(("builder", routing_role_rules["builder"]))

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


def build_delegation_summary(
    snapshot: Dict[str, Any],
    child_runs: List[Dict[str, Any]],
    *,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    parse_utc_ts: Callable[[Any], Any],
    terminal_run_statuses: Any,
    agent_workspace_labels: Dict[str, str],
    child_lineage_key: Callable[[Dict[str, Any]], str],
    failure_status: Callable[[Any], bool],
    parent_pending_retry_lineages: Callable[[str], set[str]],
    extra_retry_pending_lineages: Optional[set[str]] = None,
) -> Optional[Dict[str, Any]]:
    from datetime import datetime, timezone

    if not isinstance(child_runs, list) or not child_runs:
        return None

    total_children = len(child_runs)
    latest_by_lineage: Dict[str, Dict[str, Any]] = {}
    for child in child_runs:
        lineage_key = (
            normalize_run_id_token(child.get("retry_root_run_id"))
            or normalize_run_id_token(child.get("retry_of_run_id"))
            or normalize_run_id_token(child.get("run_id"))
            or str(child.get("run_id") or "")
        )
        previous = latest_by_lineage.get(lineage_key)
        child_sort_key = (
            parse_utc_ts(child.get("updated_at")) or parse_utc_ts(child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(child.get("run_id") or ""),
        )
        previous_sort_key = (
            parse_utc_ts(previous.get("updated_at")) or parse_utc_ts(previous.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
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

    pending_retry_lineages = parent_pending_retry_lineages(str(snapshot.get("run_id") or ""))
    if isinstance(extra_retry_pending_lineages, set):
        pending_retry_lineages |= {str(item).strip() for item in extra_retry_pending_lineages if str(item).strip()}

    for child in effective_child_runs:
        status = str(child.get("status") or "").strip().lower()
        role = normalize_agent_role(child.get("agent_role")) or str(child.get("agent_role") or "").strip().lower()
        lineage_key = child_lineage_key(child)
        retry_pending = bool(lineage_key and lineage_key in pending_retry_lineages and failure_status(status))
        if role and role not in child_roles:
            child_roles.append(role)
        if retry_pending:
            active_children += 1
        elif status in terminal_run_statuses:
            terminal_children += 1
        else:
            active_children += 1
        if status == "completed":
            completed_children += 1
        elif retry_pending:
            child_summaries.append(f"{agent_workspace_labels.get(role, role or 'Agent')}: retrying")
            continue
        elif failure_status(status):
            failed_children += 1
            child_run_id = normalize_run_id_token(child.get("run_id"))
            if child_run_id:
                failed_run_ids.append(child_run_id)
        elif status in {"waiting", "waiting_for_input"}:
            waiting_children += 1

        label = agent_workspace_labels.get(role, role or "Agent")
        summary = str(child.get("result_summary") or child.get("user_goal") or "").strip()
        if status == "completed" and summary:
            child_summaries.append(f"{label}: {summary}")
        elif failure_status(status):
            child_summaries.append(f"{label}: failed")
        elif status in {"waiting", "waiting_for_input"}:
            child_summaries.append(f"{label}: waiting")
        elif status and status not in terminal_run_statuses:
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


def refresh_parent_delegation_state(
    parent_run_id: str,
    *,
    lookup_run_snapshot_fn: Callable[[str], Dict[str, Any]],
    find_run_relationships_fn: Callable[[str, Dict[str, Any]], Any],
    timeout_stale_child_runs_fn: Callable[[str, List[Dict[str, Any]]], List[str]],
    schedule_auto_retry_for_failed_children_fn: Callable[..., set[str]],
    build_delegation_summary_fn: Callable[..., Optional[Dict[str, Any]]],
    runs_by_id: Dict[str, Any],
    refresh_archived_run_snapshot_fn: Callable[[str, Dict[str, Any]], Any],
    upsert_run_history_snapshot_fn: Callable[[Dict[str, Any]], Any],
    emit_log_fn: Callable[..., Any],
    utc_now_iso_fn: Callable[[], str],
    triggering_run_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    try:
        snapshot = lookup_run_snapshot_fn(parent_run_id)
    except HTTPException:
        return None

    parent_run, child_runs = find_run_relationships_fn(parent_run_id, snapshot)
    stale_timeouts = timeout_stale_child_runs_fn(parent_run_id, child_runs)
    if stale_timeouts:
        try:
            snapshot = lookup_run_snapshot_fn(parent_run_id)
            parent_run, child_runs = find_run_relationships_fn(parent_run_id, snapshot)
        except HTTPException:
            return None
    scheduled_retries = schedule_auto_retry_for_failed_children_fn(
        snapshot,
        child_runs,
        triggering_run_id=triggering_run_id or (stale_timeouts[0] if stale_timeouts else None),
    )
    if stale_timeouts or scheduled_retries:
        try:
            snapshot = lookup_run_snapshot_fn(parent_run_id)
            parent_run, child_runs = find_run_relationships_fn(parent_run_id, snapshot)
        except HTTPException:
            return None
    delegation_summary = build_delegation_summary_fn(
        snapshot,
        child_runs,
        extra_retry_pending_lineages=scheduled_retries,
    )
    if delegation_summary is None:
        return None

    refreshed_at = utc_now_iso_fn()
    orchestration_payload = {
        "summary": delegation_summary,
        "parent_run": parent_run,
        "child_runs": child_runs,
        "triggering_run_id": triggering_run_id,
        "updated_at": refreshed_at,
    }

    live_parent = runs_by_id.get(parent_run_id)
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
        refresh_archived_run_snapshot_fn(parent_run_id, live_parent)

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
                emit_log_fn(
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
        upsert_run_history_snapshot_fn(snapshot)

    return delegation_summary


def create_run_from_prepared_request(
    req: RunStartRequest,
    *,
    prepared: Dict[str, Any],
    services: PreparedRunCreationServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    engine = prepared["engine"]
    metadata = dict(prepared["metadata"])
    workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
    route = services.decide_execution_target(metadata, schedule_id=schedule_id)
    metadata = services.apply_execution_route_metadata(metadata, route)
    doctor_preflight = services.build_doctor_run_gate(
        execution_target=route["selected"],
        metadata=metadata,
        provider=req.provider,
        credential_id=req.credential_id,
    )
    if bool(doctor_preflight.get("blocking")):
        raise HTTPException(
            status_code=409,
            detail=str(
                doctor_preflight.get("detail")
                or doctor_preflight.get("title")
                or "Run blocked by doctor policy."
            ),
        )
    metadata["doctor_preflight"] = doctor_preflight

    if schedule_id:
        metadata["schedule_id"] = schedule_id
        metadata["scheduled"] = True
    preview_context = build_run_preview_context(
        req,
        metadata=metadata,
        workflow_snapshot=workflow_snapshot,
    )
    owner_user_id = services.agent_machine_inherited_owner_user_id(str(metadata.get("owner_user_id") or "").strip())
    if owner_user_id:
        metadata["owner_user_id"] = owner_user_id
    metadata["tool_policy_precheck"] = services.compute_tool_policy_precheck(preview_context)
    services.apply_browser_execution_metadata(metadata)
    if metadata["tool_policy_precheck"].get("blocked_count"):
        raise HTTPException(
            status_code=409,
            detail=services.local_execution_block_prompt(metadata["tool_policy_precheck"]),
        )
    runtime_policy = services.resolve_runtime_policy_mode(
        metadata,
        selected_target=metadata.get("execution_target_selected") or metadata.get("execution_target"),
    )
    metadata["policy_mode"] = runtime_policy.get("policy_mode")
    agent_machine_full_trust = services.agent_machine_full_trust_enabled(str(metadata.get("owner_user_id") or "").strip())
    browser_policy = (
        metadata["tool_policy_precheck"].get("browser_automation_policy")
        if isinstance(metadata.get("tool_policy_precheck"), dict)
        else {}
    )
    if agent_machine_full_trust and isinstance(browser_policy, dict) and bool(browser_policy.get("reviewed_approval_required")):
        metadata["browser_reviewed_approved"] = True
        if callable(services.now_iso):
            metadata["browser_reviewed_approved_at"] = services.now_iso()
    needs_local_confirmation = services.local_execution_requires_start_confirmation(
        metadata,
        metadata["tool_policy_precheck"],
    )
    if needs_local_confirmation and agent_machine_full_trust:
        services.mark_local_execution_tools_approved(metadata)
        metadata.pop("local_execution_waiting_confirmation", None)
        metadata.pop("local_execution_waiting_approval", None)
        needs_local_confirmation = False
    if needs_local_confirmation:
        metadata["local_execution_waiting_confirmation"] = True
        metadata["local_execution_waiting_approval"] = True
        preview_context["metadata"] = metadata
    run_id = services.create_run(
        engine=engine,
        context=preview_context,
        defer_local_enqueue=needs_local_confirmation,
    )
    created_run = services.load_created_run(run_id) if callable(services.load_created_run) else {}
    if not isinstance(created_run, dict):
        created_run = {}
    status = "starting"
    if needs_local_confirmation:
        approval_labels = services.precheck_human_action_labels(
            metadata["tool_policy_precheck"],
            decision="require_confirmation",
        )
        pending = services.begin_run_pending_confirmation(
            run_id,
            services.local_execution_confirmation_prompt(metadata["tool_policy_precheck"]),
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
        "metadata": metadata,
        "route": route,
        "doctor_preflight": doctor_preflight,
        "pending_confirmation": pending,
        "created_run": created_run,
    }


async def execute_durable_turn_request(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    services: RunExecutionServices,
    base_request: Optional[Any] = None,
) -> Dict[str, Any]:
    req = build_run_start_request_from_turn(turn_request, base_request=base_request)
    req = services.stamp_request_owner(req, current_user)
    prepared = services.prepare_run_start_request(req)
    metadata = dict(prepared["metadata"])
    route = decide_execution_target(metadata)
    metadata = apply_execution_route_metadata(metadata, route)
    doctor_preflight = await build_doctor_run_gate_live(
        execution_target=route["selected"],
        metadata=metadata,
        provider=req.provider,
        credential_id=req.credential_id,
    )
    if bool(doctor_preflight.get("blocking")):
        raise HTTPException(
            status_code=409,
            detail=str(
                doctor_preflight.get("detail")
                or doctor_preflight.get("title")
                or "Run blocked by doctor policy."
            ),
        )
    result = services.create_run_from_request(req)
    if isinstance(result, dict):
        result["doctor_preflight"] = doctor_preflight
    return {
        "kind": "durable_run",
        "result": result,
        "turn_request": turn_request,
    }
