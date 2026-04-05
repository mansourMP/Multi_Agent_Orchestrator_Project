from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import HTTPException


def _parent_run_context(parent_snapshot: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    return parent_context, parent_metadata


def _orchestrator_parent(
    parent_run_id: str,
    *,
    current_user: Any,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    invalid_detail: str,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    parent_snapshot = lookup_run_snapshot(parent_run_id)
    enforce_run_owner_access(current_user, parent_snapshot)
    _parent_context, parent_metadata = _parent_run_context(parent_snapshot)
    parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or parent_metadata.get("agent_role"))
    if parent_role != "orchestrator":
        raise HTTPException(status_code=400, detail=invalid_detail)
    return parent_snapshot, parent_metadata, parent_role


def _delegation_root_run_id(
    parent_run_id: str,
    *,
    parent_snapshot: dict[str, Any],
    parent_metadata: dict[str, Any],
    normalize_run_id_token: Callable[[Any], str | None],
) -> str:
    return (
        normalize_run_id_token(
            parent_snapshot.get("delegation_root_run_id")
            or parent_metadata.get("delegation_root_run_id")
            or parent_run_id
        )
        or parent_run_id
    )


def build_delegate_run_children_callbacks(
    *,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    normalize_run_id_token: Callable[[Any], str | None],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    return {
        "lookup_run_snapshot": lookup_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "normalize_agent_role": normalize_agent_role,
        "build_delegated_run_request": build_delegated_run_request,
        "execute_system_run_start_request_via_turn_runtime": execute_system_run_start_request_via_turn_runtime,
        "stamp_request_owner_fn": stamp_request_owner_fn,
        "run_execution_services": run_execution_services,
        "normalize_run_id_token": normalize_run_id_token,
        "refresh_parent_delegation_state": refresh_parent_delegation_state,
    }


def build_auto_delegate_run_children_callbacks(
    *,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    build_auto_delegation_plan: Callable[..., list[dict[str, Any]]],
    emit_auto_delegation_routing_log: Callable[..., Any] | None,
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    normalize_run_id_token: Callable[[Any], str | None],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    callbacks = build_delegate_run_children_callbacks(
        lookup_run_snapshot=lookup_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        build_delegated_run_request=build_delegated_run_request,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
        normalize_run_id_token=normalize_run_id_token,
        refresh_parent_delegation_state=refresh_parent_delegation_state,
    )
    callbacks.update(
        {
            "build_auto_delegation_plan": build_auto_delegation_plan,
            "emit_auto_delegation_routing_log": emit_auto_delegation_routing_log,
        }
    )
    return callbacks


def build_retry_failed_delegation_callbacks(
    *,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    find_run_relationships: Callable[[str, dict[str, Any]], tuple[Any, list[dict[str, Any]]]],
    normalize_run_id_token: Callable[[Any], str | None],
    parse_utc_ts: Callable[[Any], Any],
    build_retry_child_payload: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    callbacks = build_delegate_run_children_callbacks(
        lookup_run_snapshot=lookup_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        build_delegated_run_request=build_delegated_run_request,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
        normalize_run_id_token=normalize_run_id_token,
        refresh_parent_delegation_state=refresh_parent_delegation_state,
    )
    callbacks.update(
        {
            "find_run_relationships": find_run_relationships,
            "parse_utc_ts": parse_utc_ts,
            "build_retry_child_payload": build_retry_child_payload,
        }
    )
    return callbacks


def delegate_run_children(
    parent_run_id: str,
    *,
    body: Any,
    current_user: Any,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    normalize_run_id_token: Callable[[Any], str | None],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    body.validate_fields()
    parent_snapshot, parent_metadata, parent_role = _orchestrator_parent(
        parent_run_id,
        current_user=current_user,
        lookup_run_snapshot=lookup_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        invalid_detail="Delegation is only available from orchestrator-owned runs.",
    )
    note = str(body.note or "").strip() or None
    created = []
    delegation_root_run_id = _delegation_root_run_id(
        parent_run_id,
        parent_snapshot=parent_snapshot,
        parent_metadata=parent_metadata,
        normalize_run_id_token=normalize_run_id_token,
    )
    for child in body.children:
        target_role = normalize_agent_role(child.agent_role)
        if not target_role or target_role == "orchestrator":
            raise HTTPException(status_code=400, detail="Delegated child runs must target a specialist agent role.")
        child_payload = {
            "agent_role": target_role,
            "user_goal": child.user_goal,
            "business_plan": child.business_plan,
            "metadata": child.metadata if isinstance(child.metadata, dict) else {},
        }
        delegated_req = build_delegated_run_request(parent_snapshot, child_payload, note=note)
        result = execute_system_run_start_request_via_turn_runtime(
            delegated_req,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=run_execution_services(),
        )
        created.append(
            {
                **result,
                "parent_run_id": parent_run_id,
                "delegation_root_run_id": delegation_root_run_id,
                "delegated_by_role": parent_role,
                "user_goal": child.user_goal,
            }
        )
    refresh_parent_delegation_state(parent_run_id)
    return {
        "ok": True,
        "parent_run_id": parent_run_id,
        "count": len(created),
        "items": created,
    }


def auto_delegate_run_children(
    parent_run_id: str,
    *,
    request_payload: Any,
    current_user: Any,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    build_auto_delegation_plan: Callable[..., list[dict[str, Any]]],
    emit_auto_delegation_routing_log: Callable[..., Any] | None,
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    normalize_run_id_token: Callable[[Any], str | None],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    request_payload.validate_fields()
    parent_snapshot, parent_metadata, parent_role = _orchestrator_parent(
        parent_run_id,
        current_user=current_user,
        lookup_run_snapshot=lookup_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        invalid_detail="Auto-delegation is only available from orchestrator-owned runs.",
    )
    plan = build_auto_delegation_plan(parent_snapshot, max_children=int(request_payload.max_children or 3))
    if not plan:
        raise HTTPException(status_code=400, detail="No specialist delegation rules matched this run.")
    routing_source = str((((plan[0].get("metadata") if isinstance(plan[0], dict) else {}) or {}).get("auto_delegation_source") or "keyword")).strip()
    routing_reason = str((((plan[0].get("metadata") if isinstance(plan[0], dict) else {}) or {}).get("auto_delegation_reason") or "")).strip()
    if callable(emit_auto_delegation_routing_log):
        emit_auto_delegation_routing_log(parent_run_id, plan, strategy=routing_source, reason=routing_reason)
    note = str(request_payload.note or "").strip() or "Auto-planned by orchestrator rules."
    created = []
    delegation_root_run_id = _delegation_root_run_id(
        parent_run_id,
        parent_snapshot=parent_snapshot,
        parent_metadata=parent_metadata,
        normalize_run_id_token=normalize_run_id_token,
    )
    for child in plan:
        delegated_req = build_delegated_run_request(parent_snapshot, child, note=note)
        result = execute_system_run_start_request_via_turn_runtime(
            delegated_req,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=run_execution_services(),
        )
        created.append(
            {
                **result,
                "parent_run_id": parent_run_id,
                "delegation_root_run_id": delegation_root_run_id,
                "delegated_by_role": parent_role,
                "user_goal": child.get("user_goal"),
                "auto_delegation_rule": (child.get("metadata") or {}).get("auto_delegation_rule"),
            }
        )
    refresh_parent_delegation_state(parent_run_id)
    return {
        "ok": True,
        "parent_run_id": parent_run_id,
        "count": len(created),
        "note": note,
        "plan": plan,
        "items": created,
    }


def retry_failed_delegation_runs(
    parent_run_id: str,
    *,
    request_payload: Any,
    current_user: Any,
    lookup_run_snapshot: Callable[[str], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    find_run_relationships: Callable[[str, dict[str, Any]], tuple[Any, list[dict[str, Any]]]],
    normalize_run_id_token: Callable[[Any], str | None],
    parse_utc_ts: Callable[[Any], Any],
    build_retry_child_payload: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    build_delegated_run_request: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    refresh_parent_delegation_state: Callable[[str], Any],
) -> dict[str, Any]:
    request_payload.validate_fields()
    parent_snapshot, _parent_metadata, _parent_role = _orchestrator_parent(
        parent_run_id,
        current_user=current_user,
        lookup_run_snapshot=lookup_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        invalid_detail="Retry delegation is only available from orchestrator-owned runs.",
    )
    _, child_runs = find_run_relationships(parent_run_id, parent_snapshot)
    if not child_runs:
        raise HTTPException(status_code=400, detail="This orchestrator run does not have delegated child runs.")
    latest_by_lineage: dict[str, dict[str, Any]] = {}
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
    failed_effective_children = [
        child for child in latest_by_lineage.values()
        if str(child.get("status") or "").strip().lower() in {"failed", "error", "timeout", "cancelled", "stopped"}
    ]
    if request_payload.failed_run_ids:
        allowed = set(request_payload.failed_run_ids)
        failed_effective_children = [
            child for child in failed_effective_children if str(child.get("run_id") or "").strip() in allowed
        ]
    if not failed_effective_children:
        raise HTTPException(status_code=400, detail="No retryable failed child runs were found for this orchestrator run.")
    note = str(request_payload.note or "").strip() or "Retry requested from orchestration summary."
    created = []
    for child in failed_effective_children:
        child_payload = build_retry_child_payload(parent_snapshot, child, note=note)
        delegated_req = build_delegated_run_request(parent_snapshot, child_payload, note=note)
        result = execute_system_run_start_request_via_turn_runtime(
            delegated_req,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=run_execution_services(),
        )
        created.append(
            {
                **result,
                "parent_run_id": parent_run_id,
                "retry_of_run_id": child_payload.get("metadata", {}).get("retry_of_run_id"),
                "retry_root_run_id": child_payload.get("metadata", {}).get("retry_root_run_id"),
                "retry_sequence": child_payload.get("metadata", {}).get("retry_sequence"),
                "agent_role": child_payload.get("agent_role"),
                "user_goal": child_payload.get("user_goal"),
            }
        )
    refresh_parent_delegation_state(parent_run_id)
    return {
        "ok": True,
        "parent_run_id": parent_run_id,
        "count": len(created),
        "note": note,
        "items": created,
    }
