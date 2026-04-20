from __future__ import annotations

import logging
import queue
import threading
from types import SimpleNamespace
from typing import Any, Callable, Optional

from fastapi import HTTPException
from server_modules import agent_trace_service
from server_modules import browser_approval_service
from server_modules.direct_tool_config_service import run_async_tool_call
from server_modules import run_state_repository


_APPROVAL_RESOLUTION_GUARD_LOCK = threading.Lock()
_APPROVAL_RESOLUTION_GUARDS: dict[str, threading.Lock] = {}
LOGGER = logging.getLogger(__name__)
_RESOLVED_APPROVAL_STATUSES = {
    "resolved",
    "approved",
    "rejected",
    "expired",
    "cancelled",
    "canceled",
    "dismissed",
}


def _resume_run_trace_context(run: dict[str, Any]) -> Any:
    if not isinstance(run, dict):
        return None
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trace_id = (
        str(run.get("trace_id") or "").strip()
        or str(run.get("last_trace_id") or "").strip()
        or str(context.get("trace_id") or "").strip()
        or str(metadata.get("trace_id") or "").strip()
        or str(metadata.get("request_trace_id") or "").strip()
    )
    if not trace_id:
        return None
    try:
        return run_async_tool_call(
            agent_trace_service.resume_trace(
                trace_id=trace_id,
                tenant_id=str(
                    run.get("tenant_id")
                    or context.get("tenant_id")
                    or metadata.get("tenant_id")
                    or "default"
                ).strip()
                or "default",
                workspace_id=str(
                    run.get("workspace_id")
                    or context.get("workspace_id")
                    or metadata.get("workspace_id")
                    or "default"
                ).strip()
                or "default",
                thread_id=str(
                    run.get("thread_id")
                    or context.get("thread_id")
                    or metadata.get("thread_id")
                    or metadata.get("session_id")
                    or ""
                ).strip()
                or None,
                run_id=str(run.get("run_id") or "").strip() or None,
            )
        )
    except Exception as exc:
        LOGGER.warning("Failed to resume approval trace context: %s", exc)
        return None


def _emit_trace(awaitable: Any, *, operation: str) -> Any:
    try:
        return run_async_tool_call(awaitable)
    except Exception as exc:
        LOGGER.warning("Failed to emit approval trace during %s: %s", operation, exc)
        return None


def _approval_resolution_guard(approval_id: str) -> threading.Lock:
    token = str(approval_id or "").strip()
    with _APPROVAL_RESOLUTION_GUARD_LOCK:
        lock = _APPROVAL_RESOLUTION_GUARDS.get(token)
        if lock is None:
            lock = threading.Lock()
            _APPROVAL_RESOLUTION_GUARDS[token] = lock
        return lock


def build_submit_run_decision_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    return {
        "serialize_run_snapshot": serialize_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "get_pending_confirmation": get_pending_confirmation,
        "approval_correlation_id": approval_correlation_id,
        "append_approval_audit": append_approval_audit,
        "resolve_local_execution_start_approval": resolve_local_execution_start_approval,
        "emit_security_audit_event": emit_security_audit_event,
    }


def build_resolve_run_approval_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    set_pending_confirmation: Callable[[dict[str, Any], dict[str, Any]], None],
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    resolve_local_worker_recovery_approval: Callable[..., dict[str, Any]],
    run_thread_is_alive: Callable[[dict[str, Any]], bool],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
    ensure_live_run_handle: Callable[[str, dict[str, Any]], dict[str, Any] | None] = lambda _run_id, _run_record: None,
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    callbacks = build_submit_run_decision_callbacks(
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        get_pending_confirmation=get_pending_confirmation,
        approval_correlation_id=approval_correlation_id,
        append_approval_audit=append_approval_audit,
        resolve_local_execution_start_approval=resolve_local_execution_start_approval,
    )
    callbacks.update(
        {
            "set_pending_confirmation": set_pending_confirmation,
            "clear_pending_confirmation": clear_pending_confirmation,
            "parse_utc_ts": parse_utc_ts,
            "utc_now": utc_now,
            "utc_now_iso": utc_now_iso,
            "resolve_local_worker_recovery_approval": resolve_local_worker_recovery_approval,
            "run_thread_is_alive": run_thread_is_alive,
            "emit_log": emit_log,
            "schedule_restored_run_resume": schedule_restored_run_resume,
            "ensure_live_run_handle": ensure_live_run_handle,
            "emit_security_audit_event": emit_security_audit_event,
        }
    )
    return callbacks


def _pending_approval_payload(run: dict[str, Any]) -> dict[str, Any] | None:
    pending_confirmation = run.get("pending_confirmation")
    if isinstance(pending_confirmation, dict):
        return pending_confirmation
    pending_approval = run.get("pending_approval")
    if isinstance(pending_approval, dict):
        return pending_approval
    return None


def _run_workspace_id(run: dict[str, Any]) -> str:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(
        run.get("workspace_id")
        or context.get("workspace_id")
        or metadata.get("workspace_id")
        or "default"
    ).strip() or "default"


def _run_tenant_id(run: dict[str, Any]) -> str:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(
        run.get("tenant_id")
        or context.get("tenant_id")
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"


def _approval_request_payload_from_run(run_id: str, run: dict[str, Any], pending: dict[str, Any]) -> dict[str, Any]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pending_metadata = pending.get("metadata") if isinstance(pending.get("metadata"), dict) else {}
    prompt = str(pending.get("prompt") or pending.get("reason") or "Approval required.").strip()
    actions = pending.get("actions") if isinstance(pending.get("actions"), list) else pending_metadata.get("approval_actions")
    labels = pending_metadata.get("approval_labels")
    capabilities = pending_metadata.get("approval_capabilities")
    payload = {
        "approval_id": str(pending.get("approval_id") or "").strip() or None,
        "run_id": run_id,
        "workspace_id": _run_workspace_id(run),
        "tenant_id": _run_tenant_id(run),
        "owner_user_id": str(metadata.get("owner_user_id") or "").strip() or None,
        "owner_email": str(metadata.get("owner_email") or "").strip().lower() or None,
        "agent_role": str(metadata.get("agent_role") or "").strip() or None,
        "prompt": prompt,
        "requested_at": pending.get("requested_at") or pending.get("created_at"),
        "expires_at": pending.get("expires_at"),
        "correlation_id": pending.get("correlation_id"),
        "scope": str(pending.get("scope") or "once").strip().lower() or "once",
        "reusable": bool(pending.get("reusable")),
        "consequence": str(pending.get("consequence") or "").strip() or None,
        "actions": [str(item or "").strip() for item in (actions or []) if str(item or "").strip()],
        "target": str(
            pending.get("target")
            or pending_metadata.get("target")
            or pending_metadata.get("approval_target")
            or ""
        ).strip() or None,
        "labels": [str(item or "").strip() for item in (labels or []) if str(item or "").strip()],
        "capabilities": [str(item or "").strip() for item in (capabilities or []) if str(item or "").strip()],
        "metadata": pending_metadata,
        "email_preview": pending_metadata.get("email_preview") if isinstance(pending_metadata.get("email_preview"), dict) else None,
    }
    browser_summary = browser_approval_service.browser_approval_summary(pending_metadata)
    if browser_summary is not None:
        payload["browser"] = browser_summary
    return payload


def _ensure_durable_approval_request(run_id: str, snapshot_run: dict[str, Any], pending: dict[str, Any]) -> dict[str, Any]:
    approval_id = str(pending.get("approval_id") or "").strip()
    correlation_id = str(pending.get("correlation_id") or approval_id).strip() or approval_id
    fallback = _approval_request_payload_from_run(run_id, snapshot_run, pending)
    try:
        return run_state_repository.sync_create_or_update_approval_request(
            run_id,
            approval_id,
            fallback,
            "system",
            correlation_id,
            metadata=pending.get("metadata") if isinstance(pending.get("metadata"), dict) else None,
            expires_at=str(pending.get("expires_at") or "").strip() or None,
        )
    except run_state_repository.RunStatePersistenceError:
        return fallback


def list_pending_approvals_payload(
    *,
    workspace_id: str | None = None,
    limit: int = 100,
    current_user: Any = None,
    allowed_workspace_ids: set[str] | None = None,
    enforce_workspace_access_fn: Callable[[Any, Any], str] | None = None,
    workspace_entitlement_payload_fn: Callable[[dict[str, dict[str, Any]], str], dict[str, Any]] | None = None,
    current_user_is_privileged_fn: Callable[[Any], bool] | None = None,
    extract_run_owner_user_id_fn: Callable[[dict[str, Any]], str] | None = None,
    list_pending_approvals_fn: Callable[[int], list[dict[str, Any]]] | None = None,
    list_live_runs_fn: Callable[[], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit), 300))
    requested_workspace_id = (
        enforce_workspace_access_fn(current_user, workspace_id, minimum_role="viewer")
        if workspace_id and callable(enforce_workspace_access_fn)
        else str(workspace_id or "").strip() or None
    )
    entitlement_cache: dict[str, dict[str, Any]] = {}
    if requested_workspace_id and callable(workspace_entitlement_payload_fn):
        requested_entitlements = workspace_entitlement_payload_fn(entitlement_cache, requested_workspace_id)
        requested_capabilities = (
            requested_entitlements.get("capabilities")
            if isinstance(requested_entitlements.get("capabilities"), dict)
            else {}
        )
        if not bool(requested_capabilities.get("approvals_enabled")):
            raise HTTPException(status_code=403, detail="Approvals are not included in this workspace plan.")
    if list_pending_approvals_fn is None:
        list_pending_approvals_fn = run_state_repository.sync_list_pending_approvals
    if list_live_runs_fn is None:
        list_live_runs_fn = run_state_repository.sync_list_live_runs

    def _approval_status_pending(value: Any) -> bool:
        token = str(value or "").strip().lower()
        if not token:
            return True
        return token not in {"resolved", "approved", "rejected", "expired", "cancelled", "canceled", "completed"}

    def _build_live_run_approval(run: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(run, dict):
            return None
        pending = run.get("pending_approval")
        if not isinstance(pending, dict):
            pending = run.get("pending_confirmation")
        if not isinstance(pending, dict):
            return None
        approval_id = str(pending.get("approval_id") or "").strip()
        run_id = str(run.get("run_id") or "").strip()
        if not approval_id or not run_id:
            return None
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        owner_user_id = str(
            pending.get("owner_user_id")
            or metadata.get("owner_user_id")
            or (extract_run_owner_user_id_fn(run) if callable(extract_run_owner_user_id_fn) else "")
            or ""
        ).strip() or None
        owner_email = str(
            pending.get("owner_email")
            or metadata.get("owner_email")
            or ""
        ).strip().lower() or None
        status = str(
            pending.get("status")
            or run.get("pending_approval_status")
            or "requested"
        ).strip().lower() or "requested"
        return {
            "approval_id": approval_id,
            "run_id": run_id,
            "workspace_id": str(
                run.get("workspace_id")
                or context.get("workspace_id")
                or metadata.get("workspace_id")
                or "default"
            ).strip() or "default",
            "owner_user_id": owner_user_id,
            "owner_email": owner_email,
            "status": status,
            "prompt": str(pending.get("prompt") or pending.get("summary") or "Approval required.").strip() or "Approval required.",
            "requested_at": pending.get("requested_at") or run.get("updated_at") or run.get("created_at"),
            "expires_at": pending.get("expires_at"),
            "correlation_id": pending.get("correlation_id"),
            "scope": str(pending.get("scope") or "once").strip().lower() or "once",
            "reusable": bool(pending.get("reusable")),
            "consequence": str(pending.get("consequence") or "").strip() or None,
            "actions": list(pending.get("actions") or []),
            "target": pending.get("target"),
            "labels": list(pending.get("labels") or pending.get("approval_labels") or []),
            "capabilities": list(pending.get("capabilities") or pending.get("approval_capabilities") or []),
            "agent_role": str(pending.get("agent_role") or "").strip() or None,
            "metadata": pending.get("metadata") if isinstance(pending.get("metadata"), dict) else {},
            "email_preview": pending.get("email_preview") if isinstance(pending.get("email_preview"), dict) else None,
        }

    include_all = bool(callable(current_user_is_privileged_fn) and current_user_is_privileged_fn(current_user))
    request_user_id = str((current_user or {}).get("user_id") or "").strip()
    if current_user is not None and not include_all and not request_user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")

    items: list[dict[str, Any]] = []
    seen_approval_ids: set[str] = set()

    for approval in list_pending_approvals_fn(safe_limit):
        if not isinstance(approval, dict):
            continue
        approval_id = str(approval.get("approval_id") or "").strip()
        run_id = str(approval.get("run_id") or "").strip()
        if not approval_id or not run_id:
            continue
        if not _approval_status_pending(approval.get("status")):
            continue
        approval_workspace_id = str(approval.get("workspace_id") or "default").strip() or "default"
        if requested_workspace_id and approval_workspace_id != requested_workspace_id:
            continue
        if allowed_workspace_ids is not None and approval_workspace_id not in allowed_workspace_ids:
            continue
        if callable(workspace_entitlement_payload_fn):
            run_entitlements = workspace_entitlement_payload_fn(entitlement_cache, approval_workspace_id)
            run_capabilities = (
                run_entitlements.get("capabilities")
                if isinstance(run_entitlements.get("capabilities"), dict)
                else {}
            )
            if not bool(run_capabilities.get("approvals_enabled")):
                continue
        owner_user_id = str(approval.get("owner_user_id") or "").strip() or None
        if current_user is not None and not include_all and owner_user_id != request_user_id:
            continue
        metadata = approval.get("metadata") if isinstance(approval.get("metadata"), dict) else {}
        email_preview = approval.get("email_preview") if isinstance(approval.get("email_preview"), dict) else None
        prompt = str(approval.get("prompt") or "Approval required.").strip()
        browser_summary = browser_approval_service.browser_approval_summary(metadata)
        items.append(
            {
                "approval_id": approval_id,
                "run_id": run_id,
                "workspace_id": approval_workspace_id,
                "owner_user_id": owner_user_id,
                "owner_email": str(approval.get("owner_email") or "").strip().lower() or None,
                "status": str(approval.get("status") or "requested").strip().lower() or "requested",
                "action": (
                    str(approval.get("action") or "").strip()
                    or str(metadata.get("kind") or "").strip()
                    or str(approval.get("agent_role") or "").strip()
                    or "Approval"
                ),
                "summary": prompt,
                "prompt": prompt,
                "requested_at": approval.get("requested_at"),
                "expires_at": approval.get("expires_at"),
                "correlation_id": approval.get("correlation_id"),
                "scope": str(approval.get("scope") or "once").strip().lower() or "once",
                "reusable": bool(approval.get("reusable")),
                "consequence": (
                    str(approval.get("consequence") or metadata.get("consequence") or "").strip()
                    or "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."
                ),
                "actions": [str(item or "").strip() for item in (approval.get("actions") or []) if str(item or "").strip()],
                "target": (
                    str(
                        approval.get("target")
                        or (email_preview or {}).get("recipient")
                        or ""
                    ).strip()
                    or None
                ),
                "labels": [str(item or "").strip() for item in (approval.get("labels") or []) if str(item or "").strip()],
                "capabilities": [str(item or "").strip() for item in (approval.get("capabilities") or []) if str(item or "").strip()],
                "agent_role": str(approval.get("agent_role") or "").strip() or None,
                "metadata": metadata,
                "email_preview": email_preview,
                "browser": browser_summary,
            }
        )
        seen_approval_ids.add(approval_id)

    for run in list_live_runs_fn() if callable(list_live_runs_fn) else []:
        approval = _build_live_run_approval(run)
        if not isinstance(approval, dict):
            continue
        approval_id = str(approval.get("approval_id") or "").strip()
        run_id = str(approval.get("run_id") or "").strip()
        if not approval_id or not run_id or approval_id in seen_approval_ids:
            continue
        if not _approval_status_pending(approval.get("status")):
            continue
        approval_workspace_id = str(approval.get("workspace_id") or "default").strip() or "default"
        if requested_workspace_id and approval_workspace_id != requested_workspace_id:
            continue
        if allowed_workspace_ids is not None and approval_workspace_id not in allowed_workspace_ids:
            continue
        if callable(workspace_entitlement_payload_fn):
            run_entitlements = workspace_entitlement_payload_fn(entitlement_cache, approval_workspace_id)
            run_capabilities = (
                run_entitlements.get("capabilities")
                if isinstance(run_entitlements.get("capabilities"), dict)
                else {}
            )
            if not bool(run_capabilities.get("approvals_enabled")):
                continue
        owner_user_id = str(approval.get("owner_user_id") or "").strip() or None
        if current_user is not None and not include_all and owner_user_id != request_user_id:
            continue
        metadata = approval.get("metadata") if isinstance(approval.get("metadata"), dict) else {}
        email_preview = approval.get("email_preview") if isinstance(approval.get("email_preview"), dict) else None
        prompt = str(approval.get("prompt") or "Approval required.").strip()
        browser_summary = browser_approval_service.browser_approval_summary(metadata)
        items.append(
            {
                "approval_id": approval_id,
                "run_id": run_id,
                "workspace_id": approval_workspace_id,
                "owner_user_id": owner_user_id,
                "owner_email": str(approval.get("owner_email") or "").strip().lower() or None,
                "status": str(approval.get("status") or "requested").strip().lower() or "requested",
                "action": (
                    str(approval.get("action") or "").strip()
                    or str(metadata.get("kind") or "").strip()
                    or str(approval.get("agent_role") or "").strip()
                    or "Approval"
                ),
                "summary": prompt,
                "prompt": prompt,
                "requested_at": approval.get("requested_at"),
                "expires_at": approval.get("expires_at"),
                "correlation_id": approval.get("correlation_id"),
                "scope": str(approval.get("scope") or "once").strip().lower() or "once",
                "reusable": bool(approval.get("reusable")),
                "consequence": (
                    str(approval.get("consequence") or metadata.get("consequence") or "").strip()
                    or "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."
                ),
                "actions": [str(item or "").strip() for item in (approval.get("actions") or []) if str(item or "").strip()],
                "target": str(approval.get("target") or "").strip() or None,
                "labels": [str(item or "").strip() for item in (approval.get("labels") or []) if str(item or "").strip()],
                "capabilities": [str(item or "").strip() for item in (approval.get("capabilities") or []) if str(item or "").strip()],
                "agent_role": str(approval.get("agent_role") or "").strip() or None,
                "metadata": metadata,
                "email_preview": email_preview,
                "browser": browser_summary,
            }
        )
        seen_approval_ids.add(approval_id)

    items.sort(key=lambda item: str(item.get("requested_at") or ""), reverse=True)
    limited_items = items[:safe_limit]
    return {
        "items": limited_items,
        "pending": limited_items,
        "count": len(limited_items),
    }


def _approval_owned_by_current_user(
    approval_record: dict[str, Any],
    current_user: Any,
    *,
    current_user_is_privileged_fn: Callable[[Any], bool] | None = None,
) -> bool:
    if callable(current_user_is_privileged_fn) and current_user_is_privileged_fn(current_user):
        return True
    if not isinstance(current_user, dict):
        return False
    request_user_id = str(current_user.get("user_id") or "").strip()
    request_email = str(current_user.get("email") or "").strip().lower()
    owner_user_id = str(approval_record.get("owner_user_id") or "").strip()
    owner_email = str(approval_record.get("owner_email") or "").strip().lower()
    if request_user_id and owner_user_id and request_user_id == owner_user_id:
        return True
    if request_email and owner_email and request_email == owner_email:
        return True
    return False


def _run_summary_for_approval_detail(run_snapshot_record: Any) -> dict[str, Any] | None:
    if not isinstance(run_snapshot_record, dict):
        return None
    payload = run_snapshot_record.get("payload") if isinstance(run_snapshot_record.get("payload"), dict) else None
    if not isinstance(payload, dict):
        return None
    source = str(run_snapshot_record.get("source") or "").strip().lower()
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    status = str(payload.get("status") or payload.get("state") or "unknown").strip().lower() or "unknown"
    return {
        "run_id": str(payload.get("run_id") or "").strip() or None,
        "status": status,
        "source": source or "missing",
        "archived": source == "archive",
        "active": status not in {"completed", "failed", "stopped", "rejected", "aborted", "cancelled", "canceled"},
        "workspace_id": str(
            payload.get("workspace_id")
            or context.get("workspace_id")
            or metadata.get("workspace_id")
            or "default"
        ).strip() or "default",
        "tenant_id": str(
            payload.get("tenant_id")
            or context.get("tenant_id")
            or metadata.get("tenant_id")
            or "default"
        ).strip() or "default",
    }


def build_approval_detail_response(
    approval_id: str,
    *,
    current_user: Any,
    enforce_workspace_access_fn: Callable[[Any, Any], str] | None = None,
    workspace_entitlement_payload_fn: Callable[[dict[str, dict[str, Any]], str], dict[str, Any]] | None = None,
    current_user_is_privileged_fn: Callable[[Any], bool] | None = None,
    find_run_snapshot_for_approval_fn: Callable[[str], dict[str, Any] | None] | None = None,
    enforce_run_owner_access_fn: Callable[[Any, Any], None] | None = None,
) -> dict[str, Any]:
    approval_token = str(approval_id or "").strip()
    if not approval_token:
        raise HTTPException(status_code=400, detail="approval_id is required.")

    if find_run_snapshot_for_approval_fn is None:
        find_run_snapshot_for_approval_fn = run_state_repository.sync_find_run_snapshot_for_approval_id

    approval_record = run_state_repository.sync_get_approval_record(approval_token)
    if not isinstance(approval_record, dict):
        raise HTTPException(status_code=404, detail="approval_id not found")

    workspace_id = str(approval_record.get("workspace_id") or "default").strip() or "default"
    if callable(enforce_workspace_access_fn):
        workspace_id = enforce_workspace_access_fn(current_user, workspace_id, minimum_role="viewer")
    entitlement_cache: dict[str, dict[str, Any]] = {}
    if callable(workspace_entitlement_payload_fn):
        entitlement_payload = workspace_entitlement_payload_fn(entitlement_cache, workspace_id)
        capabilities = entitlement_payload.get("capabilities") if isinstance(entitlement_payload.get("capabilities"), dict) else {}
        if not bool(capabilities.get("approvals_enabled")):
            raise HTTPException(status_code=403, detail="Approvals are not included in this workspace plan.")

    run_snapshot_record = find_run_snapshot_for_approval_fn(approval_token)
    run_summary = _run_summary_for_approval_detail(run_snapshot_record)
    run_snapshot_source = str(run_snapshot_record.get("source") or "").strip().lower() if isinstance(run_snapshot_record, dict) else ""
    run_payload = run_snapshot_record.get("payload") if isinstance(run_snapshot_record, dict) and isinstance(run_snapshot_record.get("payload"), dict) else None
    if run_snapshot_source in {"live", "archive"} and isinstance(run_payload, dict) and callable(enforce_run_owner_access_fn):
        enforce_run_owner_access_fn(current_user, run_payload)
    elif not _approval_owned_by_current_user(
        approval_record,
        current_user,
        current_user_is_privileged_fn=current_user_is_privileged_fn,
    ):
        raise HTTPException(status_code=403, detail="Approval is owned by another user.")

    response = dict(approval_record)
    response["workspace_id"] = workspace_id
    response["run"] = run_summary
    metadata = approval_record.get("metadata") if isinstance(approval_record.get("metadata"), dict) else {}
    response["browser"] = browser_approval_service.browser_approval_summary(metadata, include_sensitive=True)
    return response


def build_default_resolve_run_approval_callbacks(
    *,
    server_module: Any,
    runtime_runs_api_module: Any,
    enforce_run_owner_access: Callable[[Any, Any], None] | None = None,
) -> dict[str, Any]:
    from server_modules import runtime_run_control_service
    from server_modules.run_execution_handle import attach_execution_handle

    def _ensure_live_run_handle(run_id: str, run_record: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(run_record, dict):
            return None
        runs_by_id = getattr(server_module, "runs", None)
        if not isinstance(runs_by_id, dict):
            return None
        existing = runs_by_id.get(run_id)
        if isinstance(existing, dict):
            return existing
        restored = attach_execution_handle(
            dict(run_record),
            log_queue=queue.Queue(),
            input_queue=queue.Queue(),
            started_mono=None,
            finished_mono=None,
            first_value_mono=None,
            hitl_wait_start_mono=None,
            thread_id=None,
            event_seq=int(run_record.get("_event_seq") or 0),
        )
        runs_by_id[run_id] = restored
        run_queue_index = getattr(server_module, "RUN_QUEUE_INDEX", None)
        log_queue = restored.get("logs")
        if log_queue is not None and isinstance(run_queue_index, dict):
            run_queue_index[id(log_queue)] = run_id
        persist_live_run_state = getattr(server_module, "_persist_live_run_state", None)
        if callable(persist_live_run_state):
            try:
                persist_live_run_state(run_id, restored)
            except Exception:
                pass
        return restored

    def _resolve_local_worker_recovery_approval(
        run_id: str,
        run: dict[str, Any],
        approval_id: str,
        decision_text: str,
        note: str = "",
    ) -> dict[str, Any]:
        return runtime_run_control_service.resolve_local_worker_recovery_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note=note,
            get_pending_confirmation=getattr(server_module, "_get_pending_confirmation"),
            clear_pending_confirmation=getattr(server_module, "_clear_pending_confirmation"),
            approval_correlation_id=getattr(server_module, "_approval_correlation_id"),
            utc_now_iso=getattr(server_module, "_utc_now_iso"),
            emit_log=getattr(server_module, "emit_log"),
            append_approval_audit=getattr(server_module, "_append_approval_audit"),
            schedule_restored_run_resume=getattr(runtime_runs_api_module, "_schedule_restored_run_resume"),
        )

    return build_resolve_run_approval_callbacks(
        serialize_run_snapshot=getattr(server_module, "_serialize_run_snapshot"),
        enforce_run_owner_access=enforce_run_owner_access or (lambda current_user, snapshot: None),
        get_pending_confirmation=getattr(server_module, "_get_pending_confirmation"),
        set_pending_confirmation=getattr(server_module, "_set_pending_confirmation"),
        clear_pending_confirmation=getattr(server_module, "_clear_pending_confirmation"),
        parse_utc_ts=getattr(server_module, "_parse_utc_ts"),
        utc_now=getattr(server_module, "_utc_now"),
        utc_now_iso=getattr(server_module, "_utc_now_iso"),
        approval_correlation_id=getattr(server_module, "_approval_correlation_id"),
        append_approval_audit=getattr(server_module, "_append_approval_audit"),
        resolve_local_execution_start_approval=getattr(runtime_runs_api_module, "_resolve_local_execution_start_approval"),
        resolve_local_worker_recovery_approval=_resolve_local_worker_recovery_approval,
        run_thread_is_alive=getattr(runtime_runs_api_module, "_run_thread_is_alive"),
        emit_log=getattr(server_module, "emit_log"),
        schedule_restored_run_resume=getattr(runtime_runs_api_module, "_schedule_restored_run_resume"),
        ensure_live_run_handle=_ensure_live_run_handle,
    )


def resolve_standalone_approval_with_runtime_defaults(
    approval_id: str,
    *,
    payload: dict[str, Any],
    current_user: Any = None,
    runs: dict[str, Any] | None = None,
    server_module: Any | None = None,
    runtime_runs_api_module: Any | None = None,
    resolve_run_approval_fn: Callable[..., dict[str, Any]] | None = None,
    resolve_run_approval_callbacks: dict[str, Any] | None = None,
    record_approval_resolution_fn: Callable[..., Any] | None = None,
    emit_approval_resolved_event_fn: Callable[..., Any] | None = None,
    resume_run_after_persist_fn: Callable[[str, dict[str, Any]], bool] | None = None,
    enforce_run_owner_access_fn: Callable[[Any, Any], None] | None = None,
) -> dict[str, Any]:
    if server_module is None:
        import server as server_module  # type: ignore

    if runtime_runs_api_module is None:
        from server_modules import runtime_runs_api as runtime_runs_api_module  # type: ignore

    if runs is None:
        server_runs = getattr(server_module, "runs", None)
        runs = server_runs if isinstance(server_runs, dict) else {}

    if resolve_run_approval_fn is None:
        resolve_run_approval_fn = resolve_run_approval

    if resolve_run_approval_callbacks is None:
        resolve_run_approval_callbacks = build_default_resolve_run_approval_callbacks(
            server_module=server_module,
            runtime_runs_api_module=runtime_runs_api_module,
            enforce_run_owner_access=enforce_run_owner_access_fn,
        )

    if record_approval_resolution_fn is None:
        record_approval_resolution_fn = run_state_repository.sync_record_approval_resolution

    if emit_approval_resolved_event_fn is None:
        from server_modules import outbox_service

        emit_approval_resolved_event_fn = outbox_service.emit_approval_resolved_event

    if resume_run_after_persist_fn is None:
        resume_run_after_persist_fn = getattr(runtime_runs_api_module, "_schedule_restored_run_resume", None)

    return resolve_standalone_approval(
        approval_id,
        payload=payload,
        current_user=(
            current_user
            if current_user is not None
            else {"auth_type": "api_key", "user_id": "runtime-approval-bridge", "is_admin": True}
        ),
        runs=runs or {},
        resolve_run_approval_fn=resolve_run_approval_fn,
        resolve_run_approval_callbacks=resolve_run_approval_callbacks,
        record_approval_resolution_fn=record_approval_resolution_fn,
        emit_approval_resolved_event_fn=emit_approval_resolved_event_fn,
        resume_run_after_persist_fn=resume_run_after_persist_fn,
    )


def submit_run_decision(
    run_id: str,
    *,
    run: dict[str, Any] | None,
    run_record: dict[str, Any] | None = None,
    payload: Any,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    snapshot_run = run if isinstance(run, dict) else run_record if isinstance(run_record, dict) else None
    if not isinstance(snapshot_run, dict):
        raise HTTPException(404, "Run ID not found")
    snapshot = serialize_run_snapshot(run_id, snapshot_run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(snapshot_run)
    approval_id = str(pending.get("approval_id") or "").strip() if isinstance(pending, dict) else ""
    correlation_id = str(pending.get("correlation_id") or "").strip() if isinstance(pending, dict) else ""
    context = snapshot_run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    resolved_workspace_id = str(
        snapshot_run.get("workspace_id")
        or (context.get("workspace_id") if isinstance(context, dict) else None)
        or metadata.get("workspace_id")
        or "default"
    ).strip() or "default"
    resolved_tenant_id = str(
        snapshot_run.get("tenant_id")
        or (context.get("tenant_id") if isinstance(context, dict) else None)
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"
    decision_text = str(payload.decision or "").strip().lower()
    note_text = str(payload.note or "")
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)
    resolution_token = "approved" if approved else "escalated" if escalated else "rejected"
    if approval_id and (
        bool(metadata.get("local_execution_waiting_confirmation"))
        or bool(metadata.get("local_execution_waiting_approval"))
    ):
        if isinstance(pending, dict):
            _ensure_durable_approval_request(run_id, snapshot_run, pending)
        resolved = run_state_repository.sync_resolve_approval_if_pending(
            run_id,
            approval_id,
            resolution_token,
            str((current_user or {}).get("user_id") or "user").strip() or "user",
            correlation_id or approval_correlation_id(approval_id, run_id=run_id),
            note=note_text,
            decision_payload={
                "decision": decision_text,
                "resolution": resolution_token,
                "source": "runs_decision_api",
            },
        )
        if not isinstance(resolved, dict):
            raise HTTPException(status_code=409, detail="Confirmation has already been processed for this run.")
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note_text,
        )
    if approval_id:
        if isinstance(pending, dict):
            _ensure_durable_approval_request(run_id, snapshot_run, pending)
        resolved = run_state_repository.sync_resolve_approval_if_pending(
            run_id,
            approval_id,
            resolution_token,
            str((current_user or {}).get("user_id") or "user").strip() or "user",
            correlation_id or approval_correlation_id(approval_id, run_id=run_id),
            note=note_text,
            decision_payload={
                "decision": decision_text,
                "resolution": resolution_token,
                "source": "runs_decision_api",
            },
        )
        if not isinstance(resolved, dict):
            raise HTTPException(status_code=409, detail="Confirmation has already been processed for this run.")
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        if isinstance(pending, dict):
            pending = dict(pending)
            pending["status"] = "decision_submitted"
            pending["decision_submitted_at"] = resolved.get("resolved_at")
            pending["submitted_decision"] = decision_text
            pending["submitted_note"] = note_text
            pending["resolved_at"] = resolved.get("resolved_at")
            pending["decision"] = decision_text
            pending["note"] = note_text
            run["pending_confirmation"] = pending
            run["pending_approval"] = pending
        append_approval_audit(
            approval_id=approval_id,
            stage="decision_submitted",
            decision=resolution_token,
            actor="user",
            source="runs_decision_api",
            run_id=run_id,
            note=note_text,
            correlation_id=correlation_id or approval_correlation_id(approval_id, run_id=run_id),
            metadata={"scope": "once", "reusable": False},
        )
        if callable(emit_security_audit_event):
            emit_security_audit_event(
                action="approval.decision_submitted",
                tenant_id=resolved_tenant_id,
                workspace_id=resolved_workspace_id,
                current_user=current_user,
                run_id=run_id,
                trace_id=correlation_id or approval_id,
                idempotency_key=f"approval.decision_submitted:{approval_id}:{decision_text}",
                metadata={
                    "approval_id": approval_id,
                    "decision": resolution_token,
                    "raw_decision": decision_text,
                    "source": "runs_decision_api",
                    "scope": "once",
                },
            )
        run["input_queue"].put({"approval_id": approval_id, "decision": payload.decision, "note": payload.note})
        return {
            "status": "ok",
            "approval_id": approval_id,
            "correlation_id": correlation_id or None,
            "scope": "once",
            "reusable": False,
            "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
        }
    if not isinstance(run, dict):
        raise HTTPException(status_code=409, detail="Run is not active in this process.")
    run["input_queue"].put(payload.decision)
    return {"status": "ok", "approval_id": None}


def resolve_run_approval(
    run_id: str,
    approval_id: str,
    *,
    run: dict[str, Any] | None,
    run_record: dict[str, Any] | None = None,
    payload: Any,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    set_pending_confirmation: Callable[[dict[str, Any], dict[str, Any]], None],
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    resolve_local_worker_recovery_approval: Callable[..., dict[str, Any]],
    run_thread_is_alive: Callable[[dict[str, Any]], bool],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
    ensure_live_run_handle: Callable[[str, dict[str, Any]], dict[str, Any] | None] = lambda _run_id, _run_record: None,
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    snapshot_run = run if isinstance(run, dict) else run_record if isinstance(run_record, dict) else None
    if not isinstance(snapshot_run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    snapshot = serialize_run_snapshot(run_id, snapshot_run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(snapshot_run)
    if not isinstance(pending, dict):
        raise HTTPException(status_code=409, detail="No pending confirmation for this run.")
    expected = str(pending.get("approval_id") or "").strip()
    if expected != approval_id:
        raise HTTPException(status_code=409, detail="approval_id does not match pending confirmation.")
    pending_status = str(pending.get("status") or "").strip().lower()
    if pending_status in {"decision_submitted", "resolved", "expired"}:
        raise HTTPException(status_code=409, detail="Confirmation has already been processed for this run.")
    decision_text = str(payload.decision or "").strip().lower()
    context = snapshot_run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    resolved_workspace_id = str(
        snapshot_run.get("workspace_id")
        or (context.get("workspace_id") if isinstance(context, dict) else None)
        or metadata.get("workspace_id")
        or "default"
    ).strip() or "default"
    resolved_tenant_id = str(
        snapshot_run.get("tenant_id")
        or (context.get("tenant_id") if isinstance(context, dict) else None)
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)
    resolution_token = "approved" if approved else "escalated" if escalated else "rejected"
    correlation_id = str(pending.get("correlation_id") or "").strip() or approval_correlation_id(approval_id, run_id=run_id)
    expires_at = parse_utc_ts(pending.get("expires_at"))
    if expires_at is not None and utc_now() > expires_at:
        pending["status"] = "expired"
        pending["expired_at"] = utc_now_iso()
        if isinstance(run, dict):
            set_pending_confirmation(run, pending)
        run_state_repository.sync_record_approval_resolution(
            run_id,
            approval_id,
            "expired",
            "system",
            correlation_id,
            note="Confirmation request has already expired.",
        )
        raise HTTPException(status_code=409, detail="Confirmation request has already expired.")
    _ensure_durable_approval_request(run_id, snapshot_run, pending)
    try:
        resolved = run_state_repository.sync_resolve_approval_if_pending(
            run_id,
            approval_id,
            resolution_token,
            str((current_user or {}).get("user_id") or "user").strip() or "user",
            correlation_id,
            note=str(payload.note or ""),
            decision_payload={
                "decision": decision_text,
                "resolution": resolution_token,
                "source": "runs_approval_api",
            },
        )
    except run_state_repository.RunStatePersistenceError:
        resolved = {
            "approval_id": approval_id,
            "run_id": run_id,
            "status": resolution_token,
            "resolved_by": str((current_user or {}).get("user_id") or "user").strip() or "user",
            "correlation_id": correlation_id,
        }
    if not isinstance(resolved, dict):
        raise HTTPException(status_code=409, detail="Confirmation has already been processed for this run.")
    trace_context = _resume_run_trace_context(snapshot_run)
    if trace_context is not None:
        _emit_trace(
            agent_trace_service.emit_approval_resolved(
                trace_context,
                approval_id,
                resolution_token,
                str((current_user or {}).get("user_id") or "user").strip() or "user",
                str(payload.note or ""),
            ),
            operation=f"approval.resolved:{run_id}:{approval_id}",
        )
    if bool(metadata.get("local_execution_waiting_confirmation")) or bool(metadata.get("local_execution_waiting_approval")):
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            str(payload.note or ""),
        )
    pending_metadata = pending.get("metadata") if isinstance(pending.get("metadata"), dict) else {}
    if str(pending_metadata.get("kind") or "").strip() == "local_worker_recovery_resume":
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        return resolve_local_worker_recovery_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note=str(payload.note or ""),
        )
    active_run = run if isinstance(run, dict) else ensure_live_run_handle(run_id, snapshot_run)
    if not isinstance(active_run, dict):
        raise HTTPException(status_code=409, detail="Run is not active in this process.")
    pending["status"] = "decision_submitted"
    pending["decision_submitted_at"] = str(resolved.get("resolved_at") or "").strip() or utc_now_iso()
    pending["submitted_decision"] = decision_text
    pending["submitted_note"] = str(payload.note or "")
    pending["resolved_at"] = str(resolved.get("resolved_at") or "").strip() or pending.get("resolved_at")
    pending["decision"] = decision_text
    pending["note"] = str(payload.note or "")
    set_pending_confirmation(active_run, pending)
    active_run["input_queue"].put(
        {
            "approval_id": approval_id,
            "decision": payload.decision,
            "note": payload.note,
        }
    )
    append_approval_audit(
        approval_id=approval_id,
        stage="decision_submitted",
        decision=resolution_token,
        actor="user",
        source="runs_approval_api",
        run_id=run_id,
        note=str(payload.note or ""),
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
    if callable(emit_security_audit_event):
        emit_security_audit_event(
            action="approval.decision_submitted",
            tenant_id=resolved_tenant_id,
            workspace_id=resolved_workspace_id,
            current_user=current_user,
            run_id=run_id,
            trace_id=correlation_id,
            idempotency_key=f"approval.decision_submitted:{approval_id}:{decision_text}",
            metadata={
                "approval_id": approval_id,
                "decision": resolution_token,
                "raw_decision": decision_text,
                "source": "runs_approval_api",
                "scope": "once",
            },
        )
    if not run_thread_is_alive(active_run) and str(active_run.get("status") or "").strip().lower() == "waiting_for_input":
        pending["status"] = "resolved"
        pending["resolved_at"] = utc_now_iso()
        pending["decision"] = decision_text
        pending["note"] = str(payload.note or "")
        set_pending_confirmation(active_run, pending)
        active_run["_resume_confirmation_token"] = {
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "prompt": str(pending.get("prompt") or "").strip(),
            "decision": decision_text,
            "note": str(payload.note or ""),
            "resolved_at": str(pending.get("resolved_at") or "").strip() or utc_now_iso(),
            "scope": "once",
            "reusable": False,
        }
        emit_log(
            active_run["logs"],
            "info" if approved else "warn",
            "Confirmation recorded. Restored run is resuming.",
            event="approval_resume_scheduled",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "scope": "once",
                "reusable": False,
            },
        )
        if bool(active_run.get("_defer_resume_until_approval_persisted")):
            active_run["_resume_ready_after_persist"] = bool(approved)
        else:
            schedule_restored_run_resume(run_id, active_run)
    return {
        "status": "ok",
        "run_id": run_id,
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "decision_kind": ("approved" if approved else "escalated" if escalated else "rejected"),
        "scope": "once",
        "reusable": False,
        "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
    }


def resolve_standalone_approval(
    approval_id: str,
    *,
    payload: dict[str, Any],
    current_user: Any,
    runs: dict[str, Any],
    resolve_run_approval_fn: Callable[..., dict[str, Any]],
    resolve_run_approval_callbacks: dict[str, Any],
    record_approval_resolution_fn: Callable[..., Any],
    emit_approval_resolved_event_fn: Callable[..., Any],
    resume_run_after_persist_fn: Callable[[str, dict[str, Any]], bool] | None = None,
) -> dict[str, Any]:
    approval_token = str(approval_id or "").strip()
    if not approval_token:
        raise HTTPException(status_code=400, detail="approval_id is required.")
    resolution = str(payload.get("resolution") or "").strip().lower()
    if resolution not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="resolution must be approved or rejected.")
    body_approval_id = str(payload.get("approval_id") or "").strip()
    if body_approval_id and body_approval_id != approval_token:
        raise HTTPException(status_code=400, detail="approval_id in body does not match path.")
    actor = str(payload.get("actor") or "").strip() or "user"
    reason = str(payload.get("reason") or payload.get("note") or "")
    decision = "approve" if resolution == "approved" else "reject"

    with _approval_resolution_guard(approval_token):
        approval_record = run_state_repository.sync_get_approval_record(approval_token)
        run_snapshot_record = run_state_repository.sync_find_run_snapshot_for_approval_id(approval_token)
        matched_run = (
            run_snapshot_record.get("payload")
            if isinstance(run_snapshot_record, dict)
            and str(run_snapshot_record.get("source") or "").strip().lower() == "live"
            and isinstance(run_snapshot_record.get("payload"), dict)
            else None
        )
        matched_run_id = str((approval_record or {}).get("run_id") or "").strip() if isinstance(approval_record, dict) else ""
        if not matched_run_id and isinstance(matched_run, dict):
            matched_run_id = str(matched_run.get("run_id") or "").strip()
        if matched_run_id and not isinstance(matched_run, dict):
            matched_run = run_state_repository.sync_get_live_run(matched_run_id)
            if not isinstance(matched_run, dict):
                matched_run = {"run_id": matched_run_id}
        if not isinstance(matched_run, dict) or not str(matched_run.get("run_id") or "").strip():
            matched_run = run_state_repository.sync_find_live_run_by_approval_id(approval_token)
        if (
            (not isinstance(matched_run, dict) or not str(matched_run.get("run_id") or "").strip())
            and isinstance(runs, dict)
        ):
            for candidate_run_id, candidate_run in runs.items():
                if not isinstance(candidate_run, dict):
                    continue
                pending = candidate_run.get("pending_confirmation")
                if not isinstance(pending, dict):
                    pending = candidate_run.get("pending_approval")
                if not isinstance(pending, dict):
                    continue
                if str(pending.get("approval_id") or "").strip() != approval_token:
                    continue
                matched_run = {"run_id": str(candidate_run_id or "").strip(), **candidate_run}
                break
        if not isinstance(matched_run, dict) or not str(matched_run.get("run_id") or "").strip():
            matched_run = run_state_repository.sync_find_live_run_by_approval_id(approval_token)
        matched_run_id = str((matched_run or {}).get("run_id") or "").strip() if isinstance(matched_run, dict) else ""
        if not matched_run_id or not isinstance(matched_run, dict):
            raise HTTPException(status_code=404, detail="approval_id not found")
        live_run = runs.get(matched_run_id) if isinstance(runs, dict) else None
        ensure_live_run_handle = resolve_run_approval_callbacks.get("ensure_live_run_handle")
        if not isinstance(live_run, dict) and callable(ensure_live_run_handle):
            live_run = ensure_live_run_handle(matched_run_id, matched_run)
        if isinstance(live_run, dict):
            live_run["_defer_resume_until_approval_persisted"] = True

        result = resolve_run_approval_fn(
            matched_run_id,
            approval_token,
            run=live_run if isinstance(live_run, dict) else None,
            run_record=matched_run,
            payload=SimpleNamespace(decision=decision, note=reason),
            current_user=current_user,
            **resolve_run_approval_callbacks,
        )
        context = matched_run.get("context") if isinstance(matched_run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        trace_id = str(
            matched_run.get("trace_id")
            or matched_run.get("last_trace_id")
            or context.get("trace_id")
            or metadata.get("trace_id")
            or approval_token
        ).strip()
        tenant_id = str(
            matched_run.get("tenant_id")
            or context.get("tenant_id")
            or metadata.get("tenant_id")
            or "default"
        ).strip() or "default"
        workspace_id = str(
            matched_run.get("workspace_id")
            or context.get("workspace_id")
            or "default"
        ).strip() or "default"
        record_approval_resolution_fn(
            matched_run_id,
            approval_token,
            resolution,
            actor,
            trace_id,
        )
        outbox_event = emit_approval_resolved_event_fn(
            approval_id=approval_token,
            run_id=matched_run_id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            resolution=resolution,
            actor=actor,
            reason=reason,
            metadata=metadata,
            trace_id=trace_id,
        )
        response = dict(result or {})
        if (
            resolution == "approved"
            and isinstance(live_run, dict)
            and bool(live_run.pop("_resume_ready_after_persist", False))
            and callable(resume_run_after_persist_fn)
        ):
            live_run.pop("_defer_resume_until_approval_persisted", None)
            response["resumed"] = bool(resume_run_after_persist_fn(matched_run_id, live_run))
        elif isinstance(live_run, dict):
            live_run.pop("_defer_resume_until_approval_persisted", None)
        response["run_id"] = matched_run_id
        response["approval_id"] = approval_token
        response["resolution"] = resolution
        response["actor"] = actor
        response["reason"] = reason
        response["outbox_event"] = {
            "event_id": outbox_event.event_id,
            "event_type": outbox_event.event_type,
            "trace_id": outbox_event.trace_id,
            "payload": dict(outbox_event.payload),
        }
        return response
