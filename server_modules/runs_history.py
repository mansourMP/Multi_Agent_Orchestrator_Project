from datetime import datetime, timezone
import time

from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules import entitlements_service
from server_modules import run_state_repository
from server_modules.auth import enforce_workspace_access
from server_modules.runs_output import _compact_event_text, _json_safe

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})


def _extract_owner_user_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = str(payload.get("owner_user_id") or "").strip()
    if direct:
        return direct
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(metadata.get("owner_user_id") or "").strip()


def _current_user_is_privileged(current_user: Any) -> bool:
    if not isinstance(current_user, dict):
        return False
    if bool(current_user.get("is_admin")):
        return True
    if str(current_user.get("auth_type") or "").strip() == "api_key":
        return True
    user_id = str(current_user.get("user_id") or "").strip()
    email = str(current_user.get("email") or "").strip().lower()
    admin_user_ids = set(globals().get("ORION_ADMIN_USER_IDS") or [])
    admin_emails = set(globals().get("ORION_ADMIN_EMAILS") or [])
    return bool((user_id and user_id in admin_user_ids) or (email and email in admin_emails))


def _current_user_owner_id(current_user: Any) -> str:
    if not isinstance(current_user, dict):
        return ""
    return str(current_user.get("user_id") or "").strip()


def _owned_run_ids_for_user(user_id: str) -> set[str]:
    owned: set[str] = set()
    if not user_id:
        return owned
    for run in run_state_repository.sync_list_live_runs():
        if _extract_owner_user_id(run) == user_id:
            token = str(run.get("run_id") or "").strip()
            if token:
                owned.add(token)
    with RUN_HISTORY_LOCK:
        items = list(RUN_HISTORY)
    for item in items:
        if not isinstance(item, dict):
            continue
        if _extract_owner_user_id(item) != user_id:
            continue
        token = str(item.get("run_id") or "").strip()
        if token:
            owned.add(token)
    return owned


def _extract_workspace_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = str(payload.get("workspace_id") or "").strip()
    if direct:
        return _normalize_workspace_id(direct)
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return _normalize_workspace_id(
        context.get("workspace_id") or metadata.get("workspace_id")
    )


def _extract_tenant_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = str(payload.get("tenant_id") or "").strip()
    if direct:
        return direct
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(context.get("tenant_id") or metadata.get("tenant_id") or "").strip()


def _workspace_id_for_run_id(run_id: str) -> str:
    token = str(run_id or "").strip()
    if not token:
        return ""
    live_run = run_state_repository.sync_get_live_run(token)
    workspace_id = _extract_workspace_id(live_run)
    if workspace_id:
        return workspace_id
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        if str(item.get("run_id") or "").strip() != token:
            continue
        workspace_id = _extract_workspace_id(item)
        if workspace_id:
            return workspace_id
    return ""


def _workspace_entitlement_payload(
    cache: dict[str, dict[str, Any]],
    workspace_id: str,
) -> dict[str, Any]:
    token = _normalize_workspace_id(workspace_id)
    payload = cache.get(token)
    if payload is None:
        payload = entitlements_service.workspace_entitlement_payload_for_workspace_id(workspace_id=token)
        cache[token] = payload
    return payload


def _workspace_history_cutoff_ts(
    cache: dict[str, dict[str, Any]],
    workspace_id: str,
) -> float:
    payload = _workspace_entitlement_payload(cache, workspace_id)
    capabilities = payload.get("capabilities") if isinstance(payload.get("capabilities"), dict) else {}
    history_window_days = max(1, int(capabilities.get("history_window_days") or 30))
    return float(time.time()) - float(history_window_days * 86400)


def _payload_timestamp_seconds(payload: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        text = str(payload.get(key) or "").strip()
        if not text:
            continue
        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    return None

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
                    "workspace_id": _normalize_workspace_id(item.get("workspace_id")),
                    "tenant_id": str(item.get("tenant_id") or "").strip(),
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
        "workspace_id": "",
        "tenant_id": "",
        "stage": str(stage or "").strip().lower(),
        "decision": str(decision or "").strip().lower(),
        "actor": str(actor or "").strip().lower() or "system",
        "source": str(source or "").strip().lower() or "runtime",
        "note": _compact_event_text(note, limit=300),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    if item["run_id"]:
        live_run = run_state_repository.sync_get_live_run(item["run_id"])
        item["workspace_id"] = _extract_workspace_id(live_run)
        item["tenant_id"] = _extract_tenant_id(live_run)
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
    workspace_id: Optional[str] = None,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    current_user=Depends(require_api_key),
):
    safe_limit = max(1, min(int(limit), 500))
    workspace_filter = (
        enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
        if workspace_id is not None
        else None
    )
    entitlement_cache: dict[str, dict[str, Any]] = {}
    if workspace_filter:
        capabilities = (
            _workspace_entitlement_payload(entitlement_cache, workspace_filter).get("capabilities")
            if isinstance(_workspace_entitlement_payload(entitlement_cache, workspace_filter), dict)
            else {}
        )
        if not bool((capabilities or {}).get("approvals_enabled")):
            raise HTTPException(status_code=403, detail="Approvals are not included in this workspace plan.")
    owned_run_ids: Optional[set[str]] = None
    if not _current_user_is_privileged(current_user):
        owner_user_id = _current_user_owner_id(current_user)
        if not owner_user_id:
            raise HTTPException(status_code=401, detail="Authenticated user id is required.")
        owned_run_ids = _owned_run_ids_for_user(owner_user_id)
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
        if workspace_filter:
            item_workspace_id = _normalize_workspace_id(item.get("workspace_id")) or _workspace_id_for_run_id(
                item.get("run_id")
            )
            if item_workspace_id != workspace_filter:
                continue
        else:
            item_workspace_id = _normalize_workspace_id(item.get("workspace_id")) or _workspace_id_for_run_id(
                item.get("run_id")
            )
        item_entitlements = _workspace_entitlement_payload(entitlement_cache, item_workspace_id)
        item_capabilities = item_entitlements.get("capabilities") if isinstance(item_entitlements.get("capabilities"), dict) else {}
        if not bool(item_capabilities.get("approvals_enabled")):
            continue
        cutoff_ts = _workspace_history_cutoff_ts(entitlement_cache, item_workspace_id)
        event_ts = _payload_timestamp_seconds(item, "ts")
        if event_ts is not None and event_ts < cutoff_ts:
            continue
        if owned_run_ids is not None:
            item_run_id = str(item.get("run_id") or "").strip()
            if not item_run_id or item_run_id not in owned_run_ids:
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
    current_user=Depends(require_api_key),
):
    safe_limit = max(1, min(int(limit), 300))
    workspace_filter = (
        enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
        if workspace_id is not None
        else None
    )
    entitlement_cache: dict[str, dict[str, Any]] = {}
    if workspace_filter:
        capabilities = (
            _workspace_entitlement_payload(entitlement_cache, workspace_filter).get("capabilities")
            if isinstance(_workspace_entitlement_payload(entitlement_cache, workspace_filter), dict)
            else {}
        )
        if not bool((capabilities or {}).get("approvals_enabled")):
            raise HTTPException(status_code=403, detail="Approvals are not included in this workspace plan.")
    owner_user_id = ""
    if not _current_user_is_privileged(current_user):
        owner_user_id = _current_user_owner_id(current_user)
        if not owner_user_id:
            raise HTTPException(status_code=401, detail="Authenticated user id is required.")
    pending_items: List[Dict[str, Any]] = []
    for run in run_state_repository.sync_list_live_runs():
        if not isinstance(run, dict):
            continue
        run_id = str(run.get("run_id") or "").strip()
        if not run_id:
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        run_workspace = _normalize_workspace_id(context.get("workspace_id"))
        if workspace_filter and run_workspace != workspace_filter:
            continue
        run_entitlements = _workspace_entitlement_payload(entitlement_cache, run_workspace)
        run_capabilities = run_entitlements.get("capabilities") if isinstance(run_entitlements.get("capabilities"), dict) else {}
        if not bool(run_capabilities.get("approvals_enabled")):
            continue
        status = str(run.get("status") or "").strip().lower()
        if status != "waiting_for_input":
            continue
        pending = run.get("pending_approval")
        if not isinstance(pending, dict):
            continue
        run_owner_user_id = str(metadata.get("owner_user_id") or "").strip()
        if owner_user_id and run_owner_user_id != owner_user_id:
            continue
        approval_id = str(pending.get("approval_id") or "").strip()
        if not approval_id:
            continue
        pending_items.append(
            {
                "run_id": run_id,
                "approval_id": approval_id,
                "owner_user_id": str(metadata.get("owner_user_id") or "").strip() or None,
                "owner_email": str(metadata.get("owner_email") or "").strip().lower() or None,
                "prompt": str(pending.get("prompt") or "Approval required."),
                "status": str(pending.get("status") or "pending").strip().lower() or "pending",
                "scope": str(pending.get("scope") or "once").strip().lower() or "once",
                "reusable": bool(pending.get("reusable")),
                "consequence": str(pending.get("consequence") or "").strip() or None,
                "actions": list(pending.get("actions") or []) if isinstance(pending.get("actions"), list) else [],
                "target": str(pending.get("target") or "").strip() or None,
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
    workspace_id: Optional[str] = None,
    run_id: Optional[str] = None,
    event_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    current_user=Depends(require_api_key),
):
    return await get_approval_audit(
        limit=limit,
        workspace_id=workspace_id,
        run_id=run_id,
        event_id=event_id,
        approval_id=approval_id,
        correlation_id=correlation_id,
        current_user=current_user,
    )
