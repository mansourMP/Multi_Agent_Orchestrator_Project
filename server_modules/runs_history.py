from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.runs_output import _compact_event_text, _json_safe

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

def _persist_approval_audit():
    with APPROVAL_AUDIT_LOCK:
        payload = {
            "version": 1,
            "updated_at": _utc_now_iso(),
            "items": APPROVAL_AUDIT[:ORION_APPROVAL_AUDIT_LIMIT],
        }
    _safe_write_json(ORION_APPROVAL_AUDIT_FILE, payload)


def _load_approval_audit():
    payload = _safe_read_json(ORION_APPROVAL_AUDIT_FILE, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with APPROVAL_AUDIT_LOCK:
        APPROVAL_AUDIT.clear()
        for item in items[:ORION_APPROVAL_AUDIT_LIMIT]:
            if not isinstance(item, dict):
                continue
            approval_id = str(item.get("approval_id") or "").strip()
            if not approval_id:
                continue
            APPROVAL_AUDIT.append(
                {
                    "id": str(item.get("id") or uuid.uuid4()),
                    "ts": str(item.get("ts") or _utc_now_iso()),
                    "correlation_id": str(item.get("correlation_id") or "").strip(),
                    "approval_id": approval_id,
                    "run_id": str(item.get("run_id") or "").strip(),
                    "event_id": str(item.get("event_id") or "").strip(),
                    "stage": str(item.get("stage") or "").strip().lower(),
                    "decision": str(item.get("decision") or "").strip().lower(),
                    "actor": str(item.get("actor") or "").strip().lower(),
                    "source": str(item.get("source") or "").strip().lower(),
                    "note": _compact_event_text(item.get("note"), limit=300),
                    "metadata": _json_safe(item.get("metadata") if isinstance(item.get("metadata"), dict) else {}),
                }
            )


def _approval_correlation_id(approval_id: str, run_id: Optional[str] = None, event_id: Optional[str] = None) -> str:
    token = str(approval_id or "").strip()[:8]
    run_token = str(run_id or "").strip()[:8]
    event_token = str(event_id or "").strip()[:8]
    if run_token:
        return f"run:{run_token}:{token}"
    if event_token:
        return f"event:{event_token}:{token}"
    return f"approval:{token}"


def _append_approval_audit(
    *,
    approval_id: str,
    stage: str,
    decision: str = "",
    actor: str = "system",
    source: str = "runtime",
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    note: str = "",
    correlation_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    aid = str(approval_id or "").strip()
    if not aid:
        return {}
    corr = str(correlation_id or "").strip() or _approval_correlation_id(aid, run_id=run_id, event_id=event_id)
    item = {
        "id": str(uuid.uuid4()),
        "ts": _utc_now_iso(),
        "correlation_id": corr,
        "approval_id": aid,
        "run_id": str(run_id or "").strip(),
        "event_id": str(event_id or "").strip(),
        "stage": str(stage or "").strip().lower(),
        "decision": str(decision or "").strip().lower(),
        "actor": str(actor or "").strip().lower() or "system",
        "source": str(source or "").strip().lower() or "runtime",
        "note": _compact_event_text(note, limit=300),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    with APPROVAL_AUDIT_LOCK:
        APPROVAL_AUDIT.insert(0, item)
        del APPROVAL_AUDIT[ORION_APPROVAL_AUDIT_LIMIT:]
    _persist_approval_audit()
    return item

def _cognitive_defaults() -> Dict[str, str]:
    niche_id = str(os.getenv("ORION_COGNITIVE_NICHE_ID") or "astronomy").strip() or "astronomy"
    db_override = str(os.getenv("ORION_COGNITIVE_DB_PATH") or "").strip()
    if db_override:
        db_path = db_override
    else:
        db_path = str(Path(__file__).resolve().parent / "python_engine" / "agency_memory.db")
    return {"niche_id": niche_id, "db_path": db_path}


def _cognitive_daemon_module():
    try:
        from python_engine import cognitive_daemon as _cd  # type: ignore
        return _cd
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"cognitive_daemon_unavailable: {exc}") from exc

async def list_cognitive_approvals(limit: int = 20):
    mod = _cognitive_daemon_module()
    conf = _cognitive_defaults()
    safe_limit = max(1, min(int(limit), 200))
    try:
        items = mod.list_pending_approvals(
            db_path=conf["db_path"],
            niche_id=conf["niche_id"],
            limit=safe_limit,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed_to_list_cognitive_approvals: {exc}") from exc
    return {
        "ok": True,
        "niche_id": conf["niche_id"],
        "db_path": conf["db_path"],
        "count": len(items),
        "items": items,
    }

async def resolve_cognitive_approval(event_id: str, payload: ApprovalResolvePayload):
    payload.validate_fields()
    target_event_id = str(event_id or "").strip()
    if not target_event_id:
        raise HTTPException(status_code=400, detail="event_id is required.")

    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    decision = str(payload.decision or "").strip().lower()
    approved = decision in approve_tokens
    escalated = decision in escalate_tokens
    if decision not in approve_tokens and decision not in reject_tokens and decision not in escalate_tokens:
        raise HTTPException(status_code=400, detail="Unsupported decision value.")
    correlation_id = _approval_correlation_id(target_event_id, event_id=target_event_id)

    mod = _cognitive_daemon_module()
    conf = _cognitive_defaults()
    try:
        out = mod.resolve_event_approval(
            db_path=conf["db_path"],
            event_id=target_event_id,
            approved=approved,
            note=str(payload.note or "").strip(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed_to_resolve_cognitive_approval: {exc}") from exc

    if not isinstance(out, dict):
        raise HTTPException(status_code=500, detail="invalid_cognitive_approval_response")
    if not bool(out.get("ok")):
        reason = str(out.get("error") or "approval_update_failed")
        if reason == "event_not_found":
            raise HTTPException(status_code=404, detail=reason)
        if reason == "event_not_waiting_for_input":
            raise HTTPException(status_code=409, detail=reason)
        raise HTTPException(status_code=400, detail=reason)
    _append_approval_audit(
        approval_id=target_event_id,
        stage="resolved",
        decision=("approved" if approved else "escalated" if escalated else "rejected"),
        actor="user",
        source="cognitive_api",
        event_id=target_event_id,
        note=str(payload.note or ""),
        correlation_id=correlation_id,
        metadata={"raw_decision": decision},
    )
    out["correlation_id"] = correlation_id
    out["decision_kind"] = "approved" if approved else ("escalated" if escalated else "rejected")
    return out

async def get_approval_audit(
    limit: int = 100,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
):
    safe_limit = max(1, min(int(limit), 500))
    with APPROVAL_AUDIT_LOCK:
        items = list(APPROVAL_AUDIT)
    run_value = str(run_id or "").strip()
    event_value = str(event_id or "").strip()
    approval_value = str(approval_id or "").strip()
    correlation_value = str(correlation_id or "").strip()
    filtered: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if run_value and str(item.get("run_id") or "").strip() != run_value:
            continue
        if event_value and str(item.get("event_id") or "").strip() != event_value:
            continue
        if approval_value and str(item.get("approval_id") or "").strip() != approval_value:
            continue
        if correlation_value and str(item.get("correlation_id") or "").strip() != correlation_value:
            continue
        filtered.append(item)
    payload = filtered[:safe_limit]
    return {
        "items": payload,
        "count": len(payload),
        "total": len(filtered),
        "source_file": str(ORION_APPROVAL_AUDIT_FILE),
    }

async def list_pending_approvals(
    workspace_id: Optional[str] = None,
    limit: int = 100,
):
    safe_limit = max(1, min(int(limit), 300))
    workspace_filter = _normalize_workspace_id(workspace_id) if workspace_id else None
    pending_items: List[Dict[str, Any]] = []
    for run_id, run in list(runs.items()):
        if not isinstance(run, dict):
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        run_workspace = _normalize_workspace_id(context.get("workspace_id"))
        if workspace_filter and run_workspace != workspace_filter:
            continue
        status = str(run.get("status") or "").strip().lower()
        if status != "waiting_for_input":
            continue
        pending = run.get("pending_approval")
        if not isinstance(pending, dict):
            continue
        approval_id = str(pending.get("approval_id") or "").strip()
        if not approval_id:
            continue
        pending_items.append(
            {
                "run_id": run_id,
                "approval_id": approval_id,
                "prompt": str(pending.get("prompt") or "Approval required."),
                "status": str(pending.get("status") or "pending").strip().lower() or "pending",
                "labels": list(pending.get("metadata", {}).get("approval_labels") or []) if isinstance(pending.get("metadata"), dict) else [],
                "capabilities": list(pending.get("metadata", {}).get("approval_capabilities") or []) if isinstance(pending.get("metadata"), dict) else [],
                "agent_role": str(metadata.get("agent_role") or "").strip() or None,
                "requested_at": pending.get("requested_at"),
                "expires_at": pending.get("expires_at"),
                "correlation_id": pending.get("correlation_id"),
            }
        )
        if len(pending_items) >= safe_limit:
            break
    return {
        "items": pending_items,
        "count": len(pending_items),
    }

async def get_audit(
    limit: int = 100,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
):
    return await get_approval_audit(
        limit=limit,
        run_id=run_id,
        event_id=event_id,
        approval_id=approval_id,
        correlation_id=correlation_id,
    )
