from __future__ import annotations


def _late_server_export(name: str):
    import server as _server

    return getattr(_server, name)


def _refresh_server_exports():
    import server as _server

    globals().update(_server.__dict__)
    return _server


def _resolve_local_execution_start_approval(
    run_id_str: str,
    run: dict,
    approval_id: str,
    decision_text: str,
    note: str = "",
) -> dict:
    pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
    correlation_id = str(pending.get("correlation_id") or "").strip() or _approval_correlation_id(approval_id, run_id=run_id_str)
    expires_at = _parse_utc_ts(pending.get("expires_at"))
    if expires_at is not None and _utc_now() > expires_at:
        pending["status"] = "expired"
        pending["expired_at"] = _utc_now_iso()
        run["pending_approval"] = pending
        raise HTTPException(status_code=409, detail="Approval request has already expired.")

    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)

    pending["status"] = "resolved"
    pending["resolved_at"] = _utc_now_iso()
    pending["decision"] = decision_text
    run["pending_approval"] = pending
    emit_log(
        run["logs"],
        "info" if approved else "warn",
        f"Decision received: {decision_text}",
        event="approval_received",
        data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text},
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="received",
        decision=decision_text,
        actor="user",
        source="local_execution_start",
        run_id=run_id_str,
        note=note,
        correlation_id=correlation_id,
    )

    if approved:
        run["pending_approval"] = None
        context = run.get("context")
        if isinstance(context, dict):
            metadata = context.get("metadata")
            if isinstance(metadata, dict):
                metadata.pop("local_execution_waiting_approval", None)
                _mark_local_execution_tools_approved(metadata)
                context["metadata"] = metadata
        emit_log(
            run["logs"],
            "info",
            "Approval granted. Run queued for Local Companion execution.",
            event="approval_resolved",
            data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text, "approved": True},
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="resolved",
            decision="approved",
            actor="runtime",
            source="local_execution_start",
            run_id=run_id_str,
            correlation_id=correlation_id,
        )
        _enqueue_local_companion_run(
            run_id_str,
            message="Approval granted. Run queued for Local Companion execution.",
            event="local_queued_after_approval",
        )
        return {
            "status": "ok",
            "run_id": run_id_str,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision_kind": "approved",
        }

    run["pending_approval"] = None
    context = run.get("context")
    if isinstance(context, dict):
        metadata = context.get("metadata")
        if isinstance(metadata, dict):
            metadata.pop("local_execution_waiting_approval", None)
            context["metadata"] = metadata
    emit_log(
        run["logs"],
        "warn",
        "Local companion execution was not started because approval was not granted.",
        event="approval_resolved",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision": decision_text,
            "approved": False,
            "rejected": bool(rejected),
            "escalated": bool(escalated),
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="resolved",
        decision=("escalated" if escalated else "rejected"),
        actor="runtime",
        source="local_execution_start",
        run_id=run_id_str,
        correlation_id=correlation_id,
        metadata={
            "raw_decision": decision_text,
            "approved": False,
            "rejected": bool(rejected),
            "escalated": bool(escalated),
        },
    )
    run["result"] = "Local companion execution was not started because approval was not granted."
    set_run_status(run_id_str, "failed")
    run["logs"].put(None)
    return {
        "status": "ok",
        "run_id": run_id_str,
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "decision_kind": ("escalated" if escalated else "rejected"),
    }


def register_run_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    @app.post("/runs/start", dependencies=[Depends(require_api_key)])
    async def start_run(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        return _late_server_export("_create_run_from_request")(req)

    @app.post("/runs/{run_id}/delegate", dependencies=[Depends(require_api_key)])
    async def delegate_run(run_id: uuid.UUID, body: RunDelegationRequest):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        body.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Delegation is only available from orchestrator-owned runs.")

        note = str(body.note or "").strip() or None
        created: List[Dict[str, Any]] = []
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
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child_payload, note=note)
            result = _late_server_export("_create_run_from_request")(delegated_req)
            created.append(
                {
                    **result,
                    "parent_run_id": parent_run_id,
                    "delegation_root_run_id": _late_server_export("_normalize_run_id_token")(
                        parent_snapshot.get("delegation_root_run_id")
                        or (parent_metadata or {}).get("delegation_root_run_id")
                        or parent_run_id
                    )
                    or parent_run_id,
                    "delegated_by_role": parent_role,
                    "user_goal": child.user_goal,
                }
            )

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "items": created,
        }

    @app.post("/runs/{run_id}/delegate/auto", dependencies=[Depends(require_api_key)])
    async def auto_delegate_run(run_id: uuid.UUID, body: Optional[RunAutoDelegationRequest] = None):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        req = body or RunAutoDelegationRequest()
        req.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Auto-delegation is only available from orchestrator-owned runs.")

        plan = _late_server_export("_build_auto_delegation_plan")(parent_snapshot, max_children=int(req.max_children or 3))
        if not plan:
            raise HTTPException(status_code=400, detail="No specialist delegation rules matched this run.")

        note = str(req.note or "").strip() or "Auto-planned by orchestrator rules."
        created: List[Dict[str, Any]] = []
        for child in plan:
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child, note=note)
            result = _late_server_export("_create_run_from_request")(delegated_req)
            created.append(
                {
                    **result,
                    "parent_run_id": parent_run_id,
                    "delegation_root_run_id": _late_server_export("_normalize_run_id_token")(
                        parent_snapshot.get("delegation_root_run_id")
                        or (parent_metadata or {}).get("delegation_root_run_id")
                        or parent_run_id
                    )
                    or parent_run_id,
                    "delegated_by_role": parent_role,
                    "user_goal": child.get("user_goal"),
                    "auto_delegation_rule": (child.get("metadata") or {}).get("auto_delegation_rule"),
                }
            )

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "note": note,
            "plan": plan,
            "items": created,
        }

    @app.post("/runs/{run_id}/delegate/retry-failed", dependencies=[Depends(require_api_key)])
    async def retry_failed_delegation_runs(run_id: uuid.UUID, body: Optional[RunDelegationRetryRequest] = None):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        req = body or RunDelegationRetryRequest()
        req.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Retry delegation is only available from orchestrator-owned runs.")

        _, child_runs = _late_server_export("_find_run_relationships")(parent_run_id, parent_snapshot)
        if not child_runs:
            raise HTTPException(status_code=400, detail="This orchestrator run does not have delegated child runs.")

        latest_by_lineage: Dict[str, Dict[str, Any]] = {}
        for child in child_runs:
            lineage_key = (
                _late_server_export("_normalize_run_id_token")(child.get("retry_root_run_id"))
                or _late_server_export("_normalize_run_id_token")(child.get("retry_of_run_id"))
                or _late_server_export("_normalize_run_id_token")(child.get("run_id"))
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

        failed_effective_children = [
            child for child in latest_by_lineage.values()
            if str(child.get("status") or "").strip().lower() in {"failed", "error", "timeout", "cancelled", "stopped"}
        ]
        if req.failed_run_ids:
            allowed = set(req.failed_run_ids)
            failed_effective_children = [
                child for child in failed_effective_children if str(child.get("run_id") or "").strip() in allowed
            ]

        if not failed_effective_children:
            raise HTTPException(status_code=400, detail="No retryable failed child runs were found for this orchestrator run.")

        note = str(req.note or "").strip() or "Retry requested from orchestration summary."
        created: List[Dict[str, Any]] = []
        for child in failed_effective_children:
            child_payload = _build_retry_child_payload(parent_snapshot, child, note=note)
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child_payload, note=note)
            result = _late_server_export("_create_run_from_request")(delegated_req)
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

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "note": note,
            "items": created,
        }

    @app.post("/routing/preview", dependencies=[Depends(require_api_key)])
    async def preview_routing(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        prepared = _late_server_export("_prepare_run_start_request")(req)
        metadata = dict(prepared["metadata"])
        route = decide_execution_target(metadata)
        metadata["execution_target_requested"] = route["requested"]
        metadata["execution_target_selected"] = route["selected"]
        metadata["execution_target_reason"] = route["reason"]
        if route.get("fallback"):
            metadata["execution_target_fallback"] = route.get("fallback")
        precheck = _compute_tool_policy_precheck(
            {
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
        )
        return {
            "engine": prepared["engine"],
            "agent_role": metadata.get("agent_role"),
            "agent_role_source": metadata.get("agent_role_source"),
            "route": route,
            "tool_policy_precheck": precheck,
        }

    @app.post("/runs/precheck", dependencies=[Depends(require_api_key)])
    async def precheck_run(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        prepared = _late_server_export("_prepare_run_start_request")(req)
        metadata = dict(prepared["metadata"])
        route = decide_execution_target(metadata)
        metadata["execution_target_requested"] = route["requested"]
        metadata["execution_target_selected"] = route["selected"]
        metadata["execution_target_reason"] = route["reason"]
        if route.get("fallback"):
            metadata["execution_target_fallback"] = route.get("fallback")
        precheck = _compute_tool_policy_precheck(
            {
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
        )
        return {
            "ok": True,
            "engine": prepared["engine"],
            "agent_role": metadata.get("agent_role"),
            "agent_role_source": metadata.get("agent_role_source"),
            "route": route,
            "tool_policy_precheck": precheck,
        }

    @app.get("/runs/{run_id}", dependencies=[Depends(require_api_key)])
    async def get_run(run_id: uuid.UUID):
        _refresh_server_exports()
        run_id_str = str(run_id)
        run = runs.get(run_id_str)
        archived = False

        if run is None:
            try:
                snapshot = _get_replay_payload(run_id_str)
            except HTTPException:
                raise HTTPException(404, "Run ID not found")

            context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
            metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
            parent_run, child_runs = _late_server_export("_find_run_relationships")(run_id_str, snapshot)
            delegation_summary = _late_server_export("_build_delegation_summary")(snapshot, child_runs)
            return {
                "run_id": run_id_str,
                "engine": snapshot.get("engine", "orion"),
                "status": snapshot.get("status", "unknown"),
                "created_at": snapshot.get("created_at"),
                "updated_at": snapshot.get("updated_at"),
                "duration_ms": snapshot.get("duration_ms"),
                "time_to_first_value_ms": snapshot.get("time_to_first_value_ms"),
                "hitl_wait_total_ms": round(float(snapshot.get("hitl_wait_total_ms") or 0.0), 2),
                "usage_masked": snapshot.get("usage_masked"),
                "result": snapshot.get("result_summary"),
                "result_data": snapshot.get("result_data"),
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
                "connector_binding": _late_server_export("_resolve_run_connector_binding")(snapshot),
                "tool_policy_precheck": snapshot.get("tool_policy_precheck"),
                "tool_policy_audit": snapshot.get("tool_policy_audit"),
                "memory_trace": snapshot.get("memory_trace"),
                "pending_approval": None,
                "dag": snapshot.get("dag"),
                "context": redact_sensitive(context),
                "route": {
                    "requested": metadata.get("execution_target_requested"),
                    "selected": metadata.get("execution_target_selected"),
                    "reason": metadata.get("execution_target_reason"),
                    "fallback": metadata.get("execution_target_fallback"),
                },
                "archived": True,
            }

        context = run.get("context", {})
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        snapshot = _serialize_run_snapshot(run_id_str, run)
        parent_run, child_runs = _late_server_export("_find_run_relationships")(run_id_str, snapshot)
        delegation_summary = _late_server_export("_build_delegation_summary")(snapshot, child_runs)
        return {
            "run_id": run_id_str,
            "engine": run.get("engine", "orion"),
            "status": run.get("status", "unknown"),
            "created_at": run.get("created_at"),
            "updated_at": run.get("updated_at"),
            "duration_ms": run.get("duration_ms"),
            "time_to_first_value_ms": run.get("time_to_first_value_ms"),
            "hitl_wait_total_ms": round(float(run.get("_hitl_wait_total_ms", 0.0)), 2),
            "usage_masked": run.get("usage_masked"),
            "result": run.get("result"),
            "result_data": run.get("result_data"),
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
            "connector_binding": _late_server_export("_resolve_run_connector_binding")(snapshot),
            "tool_policy_precheck": metadata.get("tool_policy_precheck"),
            "tool_policy_audit": run.get("tool_policy_audit") if isinstance(run.get("tool_policy_audit"), list) else [],
            "memory_trace": _trim_memory_trace(run.get("memory_trace") if isinstance(run.get("memory_trace"), dict) else {}),
            "pending_approval": run.get("pending_approval"),
            "dag": run.get("dag"),
            "context": redact_sensitive(context),
            "route": {
                "requested": metadata.get("execution_target_requested"),
                "selected": metadata.get("execution_target_selected"),
                "reason": metadata.get("execution_target_reason"),
                "fallback": metadata.get("execution_target_fallback"),
            },
            "archived": archived,
        }

    @app.get("/history/runs", dependencies=[Depends(require_api_key)])
    async def get_runs_history(limit: int = 30, workspace_id: Optional[str] = None, status: Optional[str] = None, pack_id: Optional[str] = None):
        _refresh_server_exports()
        safe_limit = max(1, min(limit, 200))
        with RUN_HISTORY_LOCK:
            items = list(RUN_HISTORY)
        filtered = [item for item in items if _history_item_matches(item, workspace_id, status, pack_id)]
        child_counts: Dict[str, int] = {}
        for item in filtered:
            parent_run_id = _late_server_export("_normalize_run_id_token")(item.get("parent_run_id"))
            if parent_run_id:
                child_counts[parent_run_id] = child_counts.get(parent_run_id, 0) + 1
        payload = []
        for item in filtered[:safe_limit]:
            summary = _summarize_history_item(item)
            run_id_value = str(summary.get("run_id") or "").strip()
            summary["child_run_count"] = child_counts.get(run_id_value, 0)
            payload.append(summary)
        return {
            "items": payload,
            "count": len(payload),
            "total": len(filtered),
        }

    @app.get("/runs/{run_id}/replay", dependencies=[Depends(require_api_key)])
    async def get_run_replay(run_id: uuid.UUID):
        _refresh_server_exports()
        item = _get_replay_payload(str(run_id))
        return {"item": item}

    @app.post("/runs/{run_id}/replay", dependencies=[Depends(require_api_key)])
    async def replay_run(run_id: uuid.UUID):
        _refresh_server_exports()
        item = _get_replay_payload(str(run_id))
        replay_payload = item.get("replay_request")
        if not isinstance(replay_payload, dict):
            raise HTTPException(status_code=400, detail="Replay request is not available for this run.")
        try:
            req = RunStartRequest(**replay_payload)
            return _late_server_export("_create_run_from_request")(req)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @app.get("/runs/{run_id}/stream", dependencies=[Depends(require_api_key)])
    async def stream_run(run_id: uuid.UUID):
        _refresh_server_exports()
        run_id_str = str(run_id)
        if run_id_str not in runs:
            raise HTTPException(404, "Run ID not found")
        return EventSourceResponse(iter_logs_for_run(run_id_str))

    @app.post("/runs/{run_id}/decision", dependencies=[Depends(require_api_key)])
    async def submit_run_decision(run_id: uuid.UUID, payload: DecisionPayload):
        _refresh_server_exports()
        payload.validate_fields()
        run_id_str = str(run_id)
        if run_id_str in runs:
            run = runs[run_id_str]
            pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
            approval_id = str(pending.get("approval_id") or "").strip() if isinstance(pending, dict) else ""
            correlation_id = str(pending.get("correlation_id") or "").strip() if isinstance(pending, dict) else ""
            context = run.get("context")
            metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
            if approval_id and bool(metadata.get("local_execution_waiting_approval")):
                return _resolve_local_execution_start_approval(
                    run_id_str,
                    run,
                    approval_id,
                    str(payload.decision or "").strip().lower(),
                    str(payload.note or ""),
                )
            if approval_id:
                _append_approval_audit(
                    approval_id=approval_id,
                    stage="decision_submitted",
                    decision=str(payload.decision or "").strip().lower(),
                    actor="user",
                    source="runs_decision_api",
                    run_id=run_id_str,
                    note=str(payload.note or ""),
                    correlation_id=correlation_id or _approval_correlation_id(approval_id, run_id=run_id_str),
                )
                run["input_queue"].put({"approval_id": approval_id, "decision": payload.decision})
                return {"status": "ok", "approval_id": approval_id, "correlation_id": correlation_id or None}
            run["input_queue"].put(payload.decision)
            return {"status": "ok", "approval_id": None}
        raise HTTPException(404, "Run ID not found")

    @app.post("/runs/{run_id}/approvals/{approval_id}/resolve", dependencies=[Depends(require_api_key)])
    async def resolve_run_approval(run_id: uuid.UUID, approval_id: str, payload: ApprovalResolvePayload):
        _refresh_server_exports()
        payload.validate_fields()
        run_id_str = str(run_id)
        run = runs.get(run_id_str)
        if not isinstance(run, dict):
            raise HTTPException(status_code=404, detail="Run ID not found")
        pending = run.get("pending_approval")
        if not isinstance(pending, dict):
            raise HTTPException(status_code=409, detail="No pending approval for this run.")
        expected = str(pending.get("approval_id") or "").strip()
        if expected != approval_id:
            raise HTTPException(status_code=409, detail="approval_id does not match pending approval.")
        decision_text = str(payload.decision or "").strip().lower()
        context = run.get("context")
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        if bool(metadata.get("local_execution_waiting_approval")):
            return _resolve_local_execution_start_approval(
                run_id_str,
                run,
                approval_id,
                decision_text,
                str(payload.note or ""),
            )
        approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
        reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
        escalate_tokens = {"escalate", "escalated"}
        approved = decision_text in approve_tokens
        escalated = decision_text in escalate_tokens
        rejected = decision_text in reject_tokens or (not approved and not escalated)
        correlation_id = str(pending.get("correlation_id") or "").strip() or _approval_correlation_id(approval_id, run_id=run_id_str)
        expires_at = _parse_utc_ts(pending.get("expires_at"))
        if expires_at is not None and _utc_now() > expires_at:
            pending["status"] = "expired"
            pending["expired_at"] = _utc_now_iso()
            run["pending_approval"] = pending
            raise HTTPException(status_code=409, detail="Approval request has already expired.")
        run["input_queue"].put(
            {
                "approval_id": approval_id,
                "decision": payload.decision,
                "note": payload.note,
            }
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="decision_submitted",
            decision=("approved" if approved else "escalated" if escalated else "rejected"),
            actor="user",
            source="runs_approval_api",
            run_id=run_id_str,
            note=str(payload.note or ""),
            correlation_id=correlation_id,
            metadata={
                "raw_decision": decision_text,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            },
        )
        return {
            "status": "ok",
            "run_id": run_id_str,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision_kind": ("approved" if approved else "escalated" if escalated else "rejected"),
        }
