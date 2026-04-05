from __future__ import annotations

from typing import Any, Callable, Optional


def can_view_sensitive_run_payload(user: Optional[dict]) -> bool:
    if not isinstance(user, dict):
        return False
    if bool(user.get("is_admin")):
        return True
    return str(user.get("auth_type") or "").strip() == "api_key"


def limited_run_context_view(context: dict) -> dict:
    if not isinstance(context, dict):
        return {}
    return {
        "workspace_id": context.get("workspace_id"),
        "workflow_id": context.get("workflow_id"),
        "user_goal": context.get("user_goal"),
        "business_plan": context.get("business_plan"),
    }


def limited_result_data_view(result_data: Any) -> Optional[dict]:
    if not isinstance(result_data, dict):
        return None
    execution_summary = result_data.get("execution_summary") if isinstance(result_data.get("execution_summary"), dict) else {}
    return {
        "summary": result_data.get("summary"),
        "pack_id": result_data.get("pack_id"),
        "execution_summary": {
            "risk_level": execution_summary.get("risk_level"),
            "next_action": execution_summary.get("next_action"),
            "approval_required": execution_summary.get("approval_required"),
            "approval_reason": execution_summary.get("approval_reason"),
            "estimated_time_saved_minutes": execution_summary.get("estimated_time_saved_minutes"),
        },
    }


def _route_payload(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "requested": source.get("execution_target_requested"),
        "selected": source.get("execution_target_selected"),
        "reason": source.get("execution_target_reason"),
        "fallback": source.get("execution_target_fallback"),
        "required_capabilities": source.get("execution_target_required_capabilities"),
        "missing_capabilities": source.get("execution_target_missing_capabilities"),
        "matching_runtime_ids": source.get("execution_target_matching_runtime_ids"),
        "available_runtime_ids": source.get("execution_target_available_runtime_ids"),
        "busy_runtime_ids": source.get("execution_target_busy_runtime_ids"),
        "busy_runtime_labels": source.get("execution_target_busy_runtime_labels"),
        "queued_ahead_count": source.get("execution_target_queued_ahead_count"),
        "estimated_wait_band": source.get("execution_target_estimated_wait_band"),
        "waiting_for_runtime": source.get("execution_target_waiting_for_runtime"),
        "waiting_for_capacity": source.get("execution_target_waiting_for_capacity"),
        "preferred_runtime_id": source.get("execution_target_preferred_runtime_id"),
        "preferred_runtime_label": source.get("execution_target_preferred_runtime_label"),
        "preferred_runtime_reason": source.get("execution_target_preferred_runtime_reason"),
    }


def build_archived_run_detail_response(
    *,
    run_id: str,
    snapshot: dict[str, Any],
    metadata: dict[str, Any],
    include_sensitive: bool,
    safe_context: dict[str, Any],
    parent_run: Any,
    child_runs: Any,
    delegation_summary: Any,
    connector_binding: Any,
    limited_result_data_view_fn: Callable[[Any], Optional[dict]],
    limited_node_states_view_fn: Callable[[Any], Any],
) -> dict[str, Any]:
    response = {
        "run_id": run_id,
        "engine": snapshot.get("engine", "orion"),
        "status": snapshot.get("status", "unknown"),
        "owner_user_id": snapshot.get("owner_user_id"),
        "owner_email": snapshot.get("owner_email"),
        "created_at": snapshot.get("created_at"),
        "updated_at": snapshot.get("updated_at"),
        "duration_ms": snapshot.get("duration_ms"),
        "time_to_first_value_ms": snapshot.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": round(float(snapshot.get("hitl_wait_total_ms") or 0.0), 2),
        "usage_masked": snapshot.get("usage_masked"),
        "active_profile_id": snapshot.get("active_profile_id"),
        "active_profile_label": snapshot.get("active_profile_label"),
        "active_profile_provider": snapshot.get("active_profile_provider"),
        "active_profile_model": snapshot.get("active_profile_model"),
        "active_adapter": snapshot.get("active_adapter"),
        "requested_provider": snapshot.get("requested_provider"),
        "effective_provider": snapshot.get("effective_provider"),
        "requested_model": snapshot.get("requested_model"),
        "effective_model": snapshot.get("effective_model"),
        "provider_overridden": bool(snapshot.get("provider_overridden")),
        "model_overridden": bool(snapshot.get("model_overridden")),
        "fallback_used": bool(snapshot.get("fallback_used")),
        "result": snapshot.get("result_summary"),
        "result_data": snapshot.get("result_data") if include_sensitive else limited_result_data_view_fn(snapshot.get("result_data")),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": snapshot.get("parent_run_id"),
        "delegation_root_run_id": snapshot.get("delegation_root_run_id"),
        "delegated_by_run_id": snapshot.get("delegated_by_run_id"),
        "delegated_by_role": snapshot.get("delegated_by_role"),
        "delegation_note": snapshot.get("delegation_note"),
        "parent_run": parent_run,
        "child_runs": child_runs,
        "delegation_summary": delegation_summary,
        "connector_binding": connector_binding,
        "tool_capabilities": snapshot.get("tool_capabilities") if isinstance(snapshot.get("tool_capabilities"), list) else [],
        "approval_outcome": snapshot.get("approval_outcome"),
        "evidence_items": snapshot.get("evidence_items") if isinstance(snapshot.get("evidence_items"), list) else [],
        "run_detail_contract": snapshot.get("run_detail_contract") if isinstance(snapshot.get("run_detail_contract"), dict) else {},
        "node_states": snapshot.get("node_states") if include_sensitive else limited_node_states_view_fn(snapshot.get("node_states")),
        "tool_policy_precheck": snapshot.get("tool_policy_precheck") if include_sensitive else None,
        "tool_policy_audit": snapshot.get("tool_policy_audit") if include_sensitive else [],
        "memory_trace": snapshot.get("memory_trace") if include_sensitive else {},
        "pending_confirmation": snapshot.get("pending_confirmation") or snapshot.get("pending_approval"),
        "pending_approval": snapshot.get("pending_confirmation") or snapshot.get("pending_approval"),
        "browser_checkpoint": snapshot.get("browser_checkpoint") if include_sensitive else None,
        "dag": snapshot.get("dag") if include_sensitive else None,
        "context": safe_context,
        "execution_target_requested": snapshot.get("execution_target_requested"),
        "execution_target_selected": snapshot.get("execution_target_selected"),
        "execution_target_reason": snapshot.get("execution_target_reason"),
        "execution_target_fallback": snapshot.get("execution_target_fallback"),
        "execution_target_required_capabilities": snapshot.get("execution_target_required_capabilities"),
        "execution_target_missing_capabilities": snapshot.get("execution_target_missing_capabilities"),
        "execution_target_matching_runtime_ids": snapshot.get("execution_target_matching_runtime_ids"),
        "execution_target_available_runtime_ids": snapshot.get("execution_target_available_runtime_ids"),
        "execution_target_busy_runtime_ids": snapshot.get("execution_target_busy_runtime_ids"),
        "execution_target_busy_runtime_labels": snapshot.get("execution_target_busy_runtime_labels"),
        "execution_target_queued_ahead_count": snapshot.get("execution_target_queued_ahead_count"),
        "execution_target_estimated_wait_band": snapshot.get("execution_target_estimated_wait_band"),
        "execution_target_waiting_for_runtime": snapshot.get("execution_target_waiting_for_runtime"),
        "execution_target_waiting_for_capacity": snapshot.get("execution_target_waiting_for_capacity"),
        "execution_target_preferred_runtime_id": snapshot.get("execution_target_preferred_runtime_id"),
        "execution_target_preferred_runtime_label": snapshot.get("execution_target_preferred_runtime_label"),
        "execution_target_preferred_runtime_reason": snapshot.get("execution_target_preferred_runtime_reason"),
        "route": _route_payload(snapshot),
        "archived": True,
    }
    if snapshot.get("fallback_reason"):
        response["fallback_reason"] = snapshot.get("fallback_reason")
    return response


def build_live_run_detail_response(
    *,
    run_id: str,
    run: dict[str, Any],
    snapshot: dict[str, Any],
    metadata: dict[str, Any],
    include_sensitive: bool,
    safe_context: dict[str, Any],
    parent_run: Any,
    child_runs: Any,
    delegation_summary: Any,
    connector_binding: Any,
    limited_result_data_view_fn: Callable[[Any], Optional[dict]],
    limited_node_states_view_fn: Callable[[Any], Any],
    trim_memory_trace_fn: Callable[[dict[str, Any]], Any],
    get_pending_confirmation_fn: Callable[[dict[str, Any]], Any],
) -> dict[str, Any]:
    pending_confirmation = get_pending_confirmation_fn(run) or None
    response = {
        "run_id": run_id,
        "engine": run.get("engine", "orion"),
        "status": run.get("status", "unknown"),
        "owner_user_id": str(metadata.get("owner_user_id") or "").strip() or None,
        "owner_email": str(metadata.get("owner_email") or "").strip().lower() or None,
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "duration_ms": run.get("duration_ms"),
        "time_to_first_value_ms": run.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": round(float(run.get("_hitl_wait_total_ms", 0.0)), 2),
        "usage_masked": run.get("usage_masked"),
        "active_profile_id": snapshot.get("active_profile_id"),
        "active_profile_label": snapshot.get("active_profile_label"),
        "active_profile_provider": snapshot.get("active_profile_provider"),
        "active_profile_model": snapshot.get("active_profile_model"),
        "active_adapter": snapshot.get("active_adapter"),
        "requested_provider": snapshot.get("requested_provider"),
        "effective_provider": snapshot.get("effective_provider"),
        "requested_model": snapshot.get("requested_model"),
        "effective_model": snapshot.get("effective_model"),
        "provider_overridden": bool(snapshot.get("provider_overridden")),
        "model_overridden": bool(snapshot.get("model_overridden")),
        "fallback_used": bool(snapshot.get("fallback_used")),
        "result": run.get("result"),
        "result_data": run.get("result_data") if include_sensitive else limited_result_data_view_fn(run.get("result_data")),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "delegation_note": metadata.get("delegation_note"),
        "parent_run": parent_run,
        "child_runs": child_runs,
        "delegation_summary": delegation_summary,
        "connector_binding": connector_binding,
        "tool_capabilities": snapshot.get("tool_capabilities") if isinstance(snapshot.get("tool_capabilities"), list) else [],
        "approval_outcome": snapshot.get("approval_outcome"),
        "evidence_items": snapshot.get("evidence_items") if isinstance(snapshot.get("evidence_items"), list) else [],
        "run_detail_contract": snapshot.get("run_detail_contract") if isinstance(snapshot.get("run_detail_contract"), dict) else {},
        "node_states": snapshot.get("node_states") if include_sensitive else limited_node_states_view_fn(snapshot.get("node_states")),
        "tool_policy_precheck": metadata.get("tool_policy_precheck") if include_sensitive else None,
        "tool_policy_audit": run.get("tool_policy_audit") if include_sensitive and isinstance(run.get("tool_policy_audit"), list) else [],
        "memory_trace": trim_memory_trace_fn(
            run.get("memory_trace") if include_sensitive and isinstance(run.get("memory_trace"), dict) else {}
        ),
        "pending_confirmation": pending_confirmation,
        "pending_approval": pending_confirmation,
        "browser_checkpoint": run.get("browser_checkpoint") if include_sensitive and isinstance(run.get("browser_checkpoint"), dict) else None,
        "dag": run.get("dag") if include_sensitive else None,
        "context": safe_context,
        "execution_target_requested": metadata.get("execution_target_requested"),
        "execution_target_selected": metadata.get("execution_target_selected"),
        "execution_target_reason": metadata.get("execution_target_reason"),
        "execution_target_fallback": metadata.get("execution_target_fallback"),
        "execution_target_required_capabilities": metadata.get("execution_target_required_capabilities"),
        "execution_target_missing_capabilities": metadata.get("execution_target_missing_capabilities"),
        "execution_target_matching_runtime_ids": metadata.get("execution_target_matching_runtime_ids"),
        "execution_target_available_runtime_ids": metadata.get("execution_target_available_runtime_ids"),
        "execution_target_busy_runtime_ids": metadata.get("execution_target_busy_runtime_ids"),
        "execution_target_busy_runtime_labels": metadata.get("execution_target_busy_runtime_labels"),
        "execution_target_queued_ahead_count": metadata.get("execution_target_queued_ahead_count"),
        "execution_target_estimated_wait_band": metadata.get("execution_target_estimated_wait_band"),
        "execution_target_waiting_for_runtime": metadata.get("execution_target_waiting_for_runtime"),
        "execution_target_waiting_for_capacity": metadata.get("execution_target_waiting_for_capacity"),
        "execution_target_preferred_runtime_id": metadata.get("execution_target_preferred_runtime_id"),
        "execution_target_preferred_runtime_label": metadata.get("execution_target_preferred_runtime_label"),
        "execution_target_preferred_runtime_reason": metadata.get("execution_target_preferred_runtime_reason"),
        "route": _route_payload(metadata),
        "archived": False,
    }
    if snapshot.get("fallback_reason"):
        response["fallback_reason"] = snapshot.get("fallback_reason")
    return response
