from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Optional
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import HTTPException

from server_modules import control_plane_repository
from server_modules import run_state_repository
from server_modules.direct_tool_config_service import run_async_tool_call


DEFAULT_BILLING_PLAN_ID = "free"
STRIPE_PROVIDER = "stripe"
STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300

PLAN_LABELS: Dict[str, str] = {
    "free": "Free",
    "pro": "Pro",
}

PLAN_ALIASES: Dict[str, str] = {
    "starter": "free",
    "free_personal": "free",
    "standard": "pro",
    "personal": "pro",
    "business": "pro",
    "power": "pro",
    "team": "pro",
    "enterprise": "pro",
    "enterprise_plus": "pro",
}

TERMINAL_SUBSCRIPTION_STATUSES = {
    "canceled",
    "cancelled",
    "incomplete_expired",
    "paused",
    "unpaid",
}

ACTIVE_SUBSCRIPTION_STATUSES = {
    "active",
    "trialing",
    "past_due",
}


def normalize_billing_plan_id(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token in PLAN_ALIASES:
        token = PLAN_ALIASES[token]
    return token if token in PLAN_LABELS else DEFAULT_BILLING_PLAN_ID


def billing_plan_label(plan_id: Any) -> str:
    resolved_plan_id = normalize_billing_plan_id(plan_id)
    return PLAN_LABELS.get(resolved_plan_id, resolved_plan_id.title())


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _workspace_billing_metadata(workspace: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = _coerce_dict(_coerce_dict(workspace).get("metadata"))
    admin_defaults = _coerce_dict(metadata.get("admin_defaults"))
    if isinstance(admin_defaults.get("payload"), dict):
        admin_defaults = _coerce_dict(admin_defaults.get("payload"))
    return {
        **_coerce_dict(metadata.get("entitlements")),
        **_coerce_dict(metadata.get("billing")),
        **admin_defaults,
    }


def _explicit_workspace_billing_plan_id(workspace: Optional[Dict[str, Any]]) -> Optional[str]:
    metadata = _workspace_billing_metadata(workspace)
    hosted_policy = _hosted_sage_ai_policy(metadata.get("hosted_sage_ai_policy"))
    if hosted_policy != "enabled_with_cap":
        return None
    for key in ("billing_plan", "plan", "plan_id", "plan_tier"):
        raw = metadata.get(key)
        if str(raw or "").strip():
            return normalize_billing_plan_id(raw)
    return None


def _hosted_sage_ai_policy(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in {"disabled", "owner_opt_in", "enabled_with_cap"} else "owner_opt_in"


def _hosted_sage_ai_credit_state(
    *,
    effective_plan_id: str,
    usage: Dict[str, Any],
    workspace: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    metadata = _workspace_billing_metadata(workspace)
    plan_allows_hosted_ai = effective_plan_id == "pro"
    policy = _hosted_sage_ai_policy(metadata.get("hosted_sage_ai_policy"))
    monthly_cap_usd = _coerce_float(metadata.get("hosted_sage_ai_monthly_cap_usd"))
    if monthly_cap_usd is None:
        monthly_cap_usd = 5.0
    monthly_cap_usd = max(0.0, round(float(monthly_cap_usd), 6))
    monthly_cost_usd = max(0.0, round(float(usage.get("hosted_sage_cost_usd_monthly") or 0.0), 6))
    monthly_remaining_usd = max(0.0, round(monthly_cap_usd - monthly_cost_usd, 6))

    if not plan_allows_hosted_ai:
        reason = "policy_disabled"
        message = "Empyralis-hosted AI is not included in this workspace plan."
        allowed = False
        resolved_policy = "disabled"
    elif policy == "disabled":
        reason = "policy_disabled"
        message = "Hosted Sage AI is disabled for this workspace."
        allowed = False
        resolved_policy = policy
    elif policy == "owner_opt_in":
        reason = "owner_approval_required"
        message = "Hosted Sage AI needs owner approval before this workspace can use it."
        allowed = False
        resolved_policy = policy
    elif monthly_cost_usd >= monthly_cap_usd:
        reason = "cap_reached"
        message = "Hosted Sage AI monthly cap is reached for this workspace."
        allowed = False
        resolved_policy = policy
    else:
        reason = None
        message = None
        allowed = True
        resolved_policy = policy

    return {
        "allowed": allowed,
        "plan_allows_hosted_ai": plan_allows_hosted_ai,
        "policy": resolved_policy,
        "monthly_cap_usd": monthly_cap_usd,
        "monthly_cost_usd": monthly_cost_usd,
        "monthly_remaining_usd": monthly_remaining_usd,
        "reason": reason,
        "message": message,
    }


def _stripe_secret_key() -> str:
    return str(
        os.getenv("EMPYRALIS_STRIPE_SECRET_KEY")
        or os.getenv("STRIPE_SECRET_KEY")
        or ""
    ).strip()


def _stripe_webhook_secret() -> str:
    return str(os.getenv("EMPYRALIS_STRIPE_WEBHOOK_SECRET") or "").strip()


def _stripe_price_map() -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    raw_json = str(os.getenv("EMPYRALIS_STRIPE_PRICE_IDS") or "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
        except Exception:
            parsed = {}
        if isinstance(parsed, dict):
            for raw_plan, raw_price_id in parsed.items():
                price_id = str(raw_price_id or "").strip()
                if price_id:
                    mapping[normalize_billing_plan_id(raw_plan)] = price_id
    for plan_id in PLAN_LABELS:
        env_key = f"EMPYRALIS_STRIPE_PRICE_{plan_id.upper()}"
        price_id = str(os.getenv(env_key) or "").strip()
        if price_id:
            mapping[plan_id] = price_id
    return mapping


def _price_to_plan_map() -> Dict[str, str]:
    return {price_id: plan_id for plan_id, price_id in _stripe_price_map().items() if price_id}


def _frontend_origin() -> str:
    configured = str(os.getenv("EMPYRALIS_BILLING_FRONTEND_ORIGIN") or "").strip()
    if configured:
        return configured.rstrip("/")
    origins = str(os.getenv("FRONTEND_ORIGINS") or "http://127.0.0.1:3000").split(",")
    for origin in origins:
        token = str(origin or "").strip()
        if token:
            return token.rstrip("/")
    return "http://127.0.0.1:3000"


def _billing_success_url(workspace_id: str) -> str:
    configured = str(os.getenv("EMPYRALIS_BILLING_SUCCESS_URL") or "").strip()
    if configured:
        return configured
    return f"{_frontend_origin()}/w/{workspace_id}/admin/billing?checkout=success"


def _billing_cancel_url(workspace_id: str) -> str:
    configured = str(os.getenv("EMPYRALIS_BILLING_CANCEL_URL") or "").strip()
    if configured:
        return configured
    return f"{_frontend_origin()}/w/{workspace_id}/admin/billing?checkout=cancelled"


def _billing_portal_return_url(workspace_id: str) -> str:
    configured = str(os.getenv("EMPYRALIS_BILLING_PORTAL_RETURN_URL") or "").strip()
    if configured:
        return configured
    return f"{_frontend_origin()}/w/{workspace_id}/admin/billing"


def _stripe_configured() -> bool:
    return bool(_stripe_secret_key()) and any(_stripe_price_map().values())


def _stripe_api_request(path: str, form_fields: Dict[str, Any]) -> Dict[str, Any]:
    secret_key = _stripe_secret_key()
    if not secret_key:
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")
    encoded = urlparse.urlencode(
        [
            (str(key), str(value))
            for key, value in form_fields.items()
            if value is not None and str(value) != ""
        ]
    ).encode("utf-8")
    request = urlrequest.Request(
        f"{STRIPE_API_BASE}{path}",
        data=encoded,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=15) as response:
            payload = response.read().decode("utf-8")
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"Stripe request failed: {detail or exc.reason}") from exc
    except urlerror.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Stripe request failed: {exc.reason}") from exc
    try:
        parsed = json.loads(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Stripe returned an invalid response.") from exc
    return dict(parsed) if isinstance(parsed, dict) else {}


def _subscription_effective_plan(subscription: Optional[Dict[str, Any]]) -> str:
    payload = _coerce_dict(subscription)
    if not payload:
        return DEFAULT_BILLING_PLAN_ID
    status = str(payload.get("status") or "").strip().lower()
    if status in TERMINAL_SUBSCRIPTION_STATUSES or status in {"checkout_pending", "checkout_completed"}:
        return DEFAULT_BILLING_PLAN_ID
    return normalize_billing_plan_id(payload.get("plan_id"))


def _subscription_active(subscription: Optional[Dict[str, Any]]) -> bool:
    payload = _coerce_dict(subscription)
    return str(payload.get("status") or "").strip().lower() in ACTIVE_SUBSCRIPTION_STATUSES


def _subscription_terminal(subscription: Optional[Dict[str, Any]]) -> bool:
    payload = _coerce_dict(subscription)
    return str(payload.get("status") or "").strip().lower() in TERMINAL_SUBSCRIPTION_STATUSES


def _plan_catalog_summary(current_plan_id: str) -> list[Dict[str, Any]]:
    price_map = _stripe_price_map()
    plans: list[Dict[str, Any]] = []
    for plan_id, label in PLAN_LABELS.items():
        plans.append(
            {
                "plan_id": plan_id,
                "label": label,
                "checkout_enabled": plan_id != DEFAULT_BILLING_PLAN_ID and bool(price_map.get(plan_id)),
                "price_configured": bool(price_map.get(plan_id)),
                "current": plan_id == current_plan_id,
            }
        )
    return plans


def _utc_month_start(now: Optional[datetime] = None) -> datetime.date:
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return reference.date().replace(day=1)


def _parse_run_timestamp(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw).astimezone(timezone.utc)
    except Exception:
        return None


def _run_is_managed_cloud(run: Dict[str, Any]) -> bool:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if str(metadata.get("runtime_attachment_kind") or "").strip().lower() == "self_hosted_business_node":
        return False
    execution_target = str(metadata.get("execution_target_selected") or "").strip().lower()
    runtime_mode = str(metadata.get("runtime_mode") or run.get("runtime_mode") or "").strip().lower()
    return execution_target == "cloud" or runtime_mode == "hosted_secure"


def _run_duration_minutes(run: Dict[str, Any], *, browser_only: bool = False) -> float:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if browser_only:
        has_browser_signal = bool(
            metadata.get("browser_execution_binding")
            or metadata.get("browser_automation_policy")
            or run.get("browser_checkpoint")
        )
        if not has_browser_signal:
            return 0.0
    started_at = _parse_run_timestamp(run.get("started_at"))
    completed_at = _parse_run_timestamp(run.get("completed_at")) or _parse_run_timestamp(run.get("updated_at"))
    if started_at is None or completed_at is None or completed_at < started_at:
        return 0.0
    return round(max((completed_at - started_at).total_seconds(), 0.0) / 60.0, 6)


def _workspace_runtime_usage_summary(*, workspace_id: str, tenant_id: Optional[str]) -> Dict[str, float]:
    month_start = _utc_month_start()
    runs_by_id: Dict[str, Dict[str, Any]] = {}
    for item in list(run_state_repository.sync_list_run_archive(limit=1000) or []) + list(run_state_repository.sync_list_live_runs() or []):
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id:
            continue
        context = item.get("context") if isinstance(item.get("context"), dict) else {}
        run_workspace_id = str(item.get("workspace_id") or context.get("workspace_id") or "").strip()
        run_tenant_id = str(item.get("tenant_id") or context.get("tenant_id") or "").strip()
        if run_workspace_id != str(workspace_id or "").strip():
            continue
        if tenant_id and run_tenant_id and run_tenant_id != str(tenant_id or "").strip():
            continue
        completed_at = _parse_run_timestamp(item.get("completed_at")) or _parse_run_timestamp(item.get("updated_at"))
        if completed_at is None or completed_at.date() < month_start:
            continue
        if not _run_is_managed_cloud(item):
            continue
        runs_by_id[run_id] = item
    hosted_minutes = 0.0
    browser_minutes = 0.0
    for item in runs_by_id.values():
        hosted_minutes += _run_duration_minutes(item)
        browser_minutes += _run_duration_minutes(item, browser_only=True)
    return {
        "hosted_runtime_minutes_monthly": round(hosted_minutes, 6),
        "browser_compute_minutes_monthly": round(browser_minutes, 6),
    }


def billing_proxy_from_summary(summary: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payload = dict(summary or {}) if isinstance(summary, dict) else {}
    account = _coerce_dict(payload.get("account"))
    subscription = _coerce_dict(payload.get("subscription"))
    effective_plan_id = _subscription_effective_plan(subscription)
    return {
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "workspace_name": str(payload.get("workspace_name") or "").strip() or None,
        "provider": str(payload.get("provider") or STRIPE_PROVIDER).strip().lower() or STRIPE_PROVIDER,
        "effective_plan_id": effective_plan_id,
        "effective_plan_label": billing_plan_label(effective_plan_id),
        "subscription_status": str(subscription.get("status") or "inactive").strip().lower() or "inactive",
        "billing_email": str(account.get("billing_email") or "").strip().lower() or None,
        "provider_customer_id": str(account.get("provider_customer_id") or "").strip() or None,
        "current_period_end": str(subscription.get("current_period_end") or "").strip() or None,
    }


def workspace_billing_summary_for_workspace_id(
    workspace_id: str,
    *,
    workspace: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    resolved_workspace = dict(workspace) if isinstance(workspace, dict) else {}
    if not resolved_workspace:
        resolved_workspace = run_async_tool_call(control_plane_repository.get_workspace_by_id(workspace_id)) or {}
    if not isinstance(resolved_workspace, dict) or not str(resolved_workspace.get("workspace_id") or "").strip():
        raise HTTPException(status_code=404, detail="Workspace not found.")
    summary = run_async_tool_call(
        control_plane_repository.ensure_workspace_billing_defaults(
            str(resolved_workspace.get("workspace_id") or "").strip(),
            tenant_id=str(resolved_workspace.get("tenant_id") or "").strip() or None,
        )
    )
    payload = dict(summary or {})
    account = _coerce_dict(payload.get("account"))
    subscription = _coerce_dict(payload.get("subscription"))
    effective_plan_id = _subscription_effective_plan(subscription)
    workspace_plan_id = _explicit_workspace_billing_plan_id(resolved_workspace)
    if workspace_plan_id and effective_plan_id == DEFAULT_BILLING_PLAN_ID:
        effective_plan_id = workspace_plan_id
    tenant_id = str(payload.get("tenant_id") or resolved_workspace.get("tenant_id") or "").strip() or None
    usage_summary = run_async_tool_call(
        control_plane_repository.summarize_workspace_billing_usage(
            tenant_id=str(tenant_id or "").strip() or "default",
            workspace_id=str(payload.get("workspace_id") or resolved_workspace.get("workspace_id") or "").strip(),
        )
    ) if tenant_id else {}
    runtime_usage = _workspace_runtime_usage_summary(
        workspace_id=str(payload.get("workspace_id") or resolved_workspace.get("workspace_id") or "").strip(),
        tenant_id=tenant_id,
    )
    limits = {
        "max_specialists": 1 if effective_plan_id == "free" else 3,
        "hosted_runtime_minutes_monthly": 0 if effective_plan_id == "free" else 1500,
        "hosted_ai_enabled": effective_plan_id == "pro",
        "priority_sync_enabled": effective_plan_id == "pro",
        "local_gateway_enabled": True,
        "mini_apps_unlimited": True,
    }
    usage = {
        **_coerce_dict(usage_summary),
        **runtime_usage,
        "max_specialists": limits["max_specialists"],
        "specialists_in_use": len(
            run_async_tool_call(
                control_plane_repository.list_deployed_agents_for_workspace(
                    str(payload.get("workspace_id") or resolved_workspace.get("workspace_id") or "").strip(),
                    tenant_id=str(tenant_id or "").strip() or None,
                )
            ) or []
        ),
    }
    hosted_sage_ai = _hosted_sage_ai_credit_state(
        effective_plan_id=effective_plan_id,
        usage=usage,
        workspace=resolved_workspace,
    )
    return {
        "ok": True,
        "workspace_id": str(payload.get("workspace_id") or resolved_workspace.get("workspace_id") or "").strip(),
        "tenant_id": tenant_id,
        "workspace_name": str(payload.get("workspace_name") or resolved_workspace.get("name") or "").strip()
        or str(resolved_workspace.get("workspace_id") or "").strip(),
        "provider": STRIPE_PROVIDER,
        "configured": _stripe_configured(),
        "account": {
            "billing_email": str(account.get("billing_email") or "").strip().lower() or None,
            "provider_customer_id": str(account.get("provider_customer_id") or "").strip() or None,
            "default_currency": str(account.get("default_currency") or "usd").strip().lower() or "usd",
            "status": str(account.get("status") or "active").strip().lower() or "active",
            "metadata": _coerce_dict(account.get("metadata")),
        },
        "subscription": {
            "plan_id": normalize_billing_plan_id(subscription.get("plan_id")),
            "effective_plan_id": effective_plan_id,
            "label": PLAN_LABELS.get(effective_plan_id, effective_plan_id.title()),
            "status": str(subscription.get("status") or "active").strip().lower() or "active",
            "provider_subscription_id": str(subscription.get("provider_subscription_id") or "").strip() or None,
            "provider_price_id": str(subscription.get("provider_price_id") or "").strip() or None,
            "provider_product_id": str(subscription.get("provider_product_id") or "").strip() or None,
            "checkout_session_id": str(subscription.get("checkout_session_id") or "").strip() or None,
            "checkout_url": str(subscription.get("checkout_url") or "").strip() or None,
            "portal_url": str(subscription.get("portal_url") or "").strip() or None,
            "currency": str(subscription.get("currency") or "usd").strip().lower() or "usd",
            "billing_interval": str(subscription.get("billing_interval") or "").strip().lower() or None,
            "current_period_start": _coerce_int(subscription.get("current_period_start")),
            "current_period_end": _coerce_int(subscription.get("current_period_end")),
            "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
            "canceled_at": _coerce_int(subscription.get("canceled_at")),
            "trial_ends_at": _coerce_int(subscription.get("trial_ends_at")),
            "metadata": _coerce_dict(subscription.get("metadata")),
            "active": _subscription_active(subscription),
            "terminal": _subscription_terminal(subscription),
        },
        "portal_available": bool(account.get("provider_customer_id")) and _stripe_configured(),
        "plans": _plan_catalog_summary(effective_plan_id),
        "limits": limits,
        "usage": usage,
        "hosted_sage_ai": hosted_sage_ai,
    }


def resolve_workspace_billing_plan_id(
    *,
    workspace_id: str,
    workspace: Optional[Dict[str, Any]] = None,
) -> str:
    summary = workspace_billing_summary_for_workspace_id(workspace_id, workspace=workspace)
    subscription = _coerce_dict(summary.get("subscription"))
    return normalize_billing_plan_id(subscription.get("effective_plan_id"))


def create_workspace_checkout_session(
    *,
    workspace_id: str,
    plan_id: str,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
    billing_email: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_plan_id = normalize_billing_plan_id(plan_id)
    if normalized_plan_id == DEFAULT_BILLING_PLAN_ID:
        raise HTTPException(status_code=400, detail="Free does not require checkout.")
    if normalized_plan_id != "pro":
        raise HTTPException(status_code=400, detail="Only the Pro plan is available for checkout.")
    price_id = _stripe_price_map().get(normalized_plan_id)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Billing plan '{normalized_plan_id}' is not configured.")
    summary = workspace_billing_summary_for_workspace_id(workspace_id)
    account = _coerce_dict(summary.get("account"))
    form_fields: Dict[str, Any] = {
        "mode": "subscription",
        "success_url": str(success_url or _billing_success_url(workspace_id)).strip(),
        "cancel_url": str(cancel_url or _billing_cancel_url(workspace_id)).strip(),
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": 1,
        "client_reference_id": workspace_id,
        "metadata[workspace_id]": workspace_id,
        "metadata[plan_id]": normalized_plan_id,
        "subscription_data[metadata][workspace_id]": workspace_id,
        "subscription_data[metadata][plan_id]": normalized_plan_id,
    }
    customer_id = str(account.get("provider_customer_id") or "").strip()
    if customer_id:
        form_fields["customer"] = customer_id
    elif billing_email:
        form_fields["customer_email"] = str(billing_email or "").strip().lower()
    response = _stripe_api_request("/checkout/sessions", form_fields)
    checkout_session_id = str(response.get("id") or "").strip()
    checkout_url = str(response.get("url") or "").strip()
    if not checkout_session_id or not checkout_url:
        raise HTTPException(status_code=502, detail="Stripe checkout session did not include a usable URL.")
    run_async_tool_call(
        control_plane_repository.upsert_workspace_billing_subscription(
            workspace_id,
            plan_id=normalized_plan_id,
            status="checkout_pending",
            provider_customer_id=str(response.get("customer") or "").strip() or None,
            checkout_session_id=checkout_session_id,
            checkout_url=checkout_url,
            currency=str(response.get("currency") or account.get("default_currency") or "usd").strip().lower() or "usd",
            metadata={"source": "stripe_checkout"},
        )
    )
    return {
        "ok": True,
        "provider": STRIPE_PROVIDER,
        "plan_id": normalized_plan_id,
        "checkout_session_id": checkout_session_id,
        "checkout_url": checkout_url,
    }


def create_workspace_portal_session(
    *,
    workspace_id: str,
    return_url: Optional[str] = None,
) -> Dict[str, Any]:
    summary = workspace_billing_summary_for_workspace_id(workspace_id)
    account = _coerce_dict(summary.get("account"))
    customer_id = str(account.get("provider_customer_id") or "").strip()
    if not customer_id:
        raise HTTPException(status_code=400, detail="Workspace does not have a billable customer account yet.")
    response = _stripe_api_request(
        "/billing_portal/sessions",
        {
            "customer": customer_id,
            "return_url": str(return_url or _billing_portal_return_url(workspace_id)).strip(),
        },
    )
    portal_url = str(response.get("url") or "").strip()
    if not portal_url:
        raise HTTPException(status_code=502, detail="Stripe portal session did not include a usable URL.")
    subscription = _coerce_dict(summary.get("subscription"))
    run_async_tool_call(
        control_plane_repository.upsert_workspace_billing_subscription(
            workspace_id,
            plan_id=normalize_billing_plan_id(subscription.get("plan_id")),
            status=str(subscription.get("status") or "active").strip().lower() or "active",
            provider_subscription_id=str(subscription.get("provider_subscription_id") or "").strip() or None,
            provider_price_id=str(subscription.get("provider_price_id") or "").strip() or None,
            provider_product_id=str(subscription.get("provider_product_id") or "").strip() or None,
            provider_customer_id=customer_id,
            checkout_session_id=str(subscription.get("checkout_session_id") or "").strip() or None,
            checkout_url=str(subscription.get("checkout_url") or "").strip() or None,
            portal_url=portal_url,
            currency=str(subscription.get("currency") or "usd").strip().lower() or "usd",
            billing_interval=str(subscription.get("billing_interval") or "").strip().lower() or None,
            current_period_start=_coerce_int(subscription.get("current_period_start")),
            current_period_end=_coerce_int(subscription.get("current_period_end")),
            cancel_at_period_end=bool(subscription.get("cancel_at_period_end")),
            canceled_at=_coerce_int(subscription.get("canceled_at")),
            trial_ends_at=_coerce_int(subscription.get("trial_ends_at")),
            metadata=_coerce_dict(subscription.get("metadata")),
        )
    )
    return {
        "ok": True,
        "provider": STRIPE_PROVIDER,
        "portal_url": portal_url,
    }


def _stripe_signature_payload(timestamp: str, body: bytes) -> bytes:
    return f"{timestamp}.{body.decode('utf-8')}".encode("utf-8")


def verify_stripe_webhook_signature(body: bytes, signature_header: str) -> None:
    secret = _stripe_webhook_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Stripe webhook secret is not configured.")
    parts: Dict[str, str] = {}
    for item in str(signature_header or "").split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        parts[key.strip()] = value.strip()
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        raise HTTPException(status_code=400, detail="Stripe signature is invalid.")
    try:
        timestamp_value = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Stripe signature timestamp is invalid.") from exc
    if abs(int(time.time()) - timestamp_value) > STRIPE_WEBHOOK_TOLERANCE_SECONDS:
        raise HTTPException(status_code=400, detail="Stripe signature timestamp is outside the tolerance window.")
    expected = hmac.new(
        secret.encode("utf-8"),
        _stripe_signature_payload(timestamp, body),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Stripe signature verification failed.")


def _workspace_id_from_webhook_object(payload: Dict[str, Any]) -> Optional[str]:
    metadata = _coerce_dict(payload.get("metadata"))
    token = (
        str(metadata.get("workspace_id") or "").strip()
        or str(payload.get("client_reference_id") or "").strip()
    )
    return token or None


def _plan_id_from_subscription_object(payload: Dict[str, Any]) -> str:
    metadata = _coerce_dict(payload.get("metadata"))
    metadata_plan = str(metadata.get("plan_id") or metadata.get("target_plan") or "").strip()
    if metadata_plan:
        return normalize_billing_plan_id(metadata_plan)
    price_to_plan = _price_to_plan_map()
    items = (((payload.get("items") or {}).get("data")) if isinstance(payload.get("items"), dict) else None) or []
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            price = _coerce_dict(item.get("price"))
            price_id = str(price.get("id") or "").strip()
            if price_id and price_id in price_to_plan:
                return price_to_plan[price_id]
    return DEFAULT_BILLING_PLAN_ID


def apply_stripe_webhook_event(event: Dict[str, Any]) -> Dict[str, Any]:
    event_type = str(event.get("type") or "").strip()
    data = _coerce_dict(event.get("data"))
    obj = _coerce_dict(data.get("object"))
    if not event_type or not obj:
        raise HTTPException(status_code=400, detail="Stripe webhook payload is invalid.")

    if event_type == "checkout.session.completed":
        workspace_id = _workspace_id_from_webhook_object(obj)
        if not workspace_id:
            return {"ok": True, "ignored": True, "reason": "missing_workspace_id"}
        customer_details = _coerce_dict(obj.get("customer_details"))
        run_async_tool_call(
            control_plane_repository.upsert_workspace_billing_account(
                workspace_id,
                billing_email=str(customer_details.get("email") or "").strip().lower() or None,
                provider_customer_id=str(obj.get("customer") or "").strip() or None,
                metadata={"source": "stripe_webhook"},
            )
        )
        target_plan = normalize_billing_plan_id(
            _coerce_dict(obj.get("metadata")).get("plan_id")
            or _coerce_dict(obj.get("metadata")).get("target_plan")
        )
        run_async_tool_call(
            control_plane_repository.upsert_workspace_billing_subscription(
                workspace_id,
                plan_id=target_plan,
                status="checkout_completed",
                provider_customer_id=str(obj.get("customer") or "").strip() or None,
                checkout_session_id=str(obj.get("id") or "").strip() or None,
                metadata={"source": "stripe_webhook"},
            )
        )
        return {"ok": True, "event_type": event_type, "workspace_id": workspace_id}

    if event_type.startswith("customer.subscription."):
        workspace_id = _workspace_id_from_webhook_object(obj)
        if not workspace_id:
            return {"ok": True, "ignored": True, "reason": "missing_workspace_id"}
        customer_id = str(obj.get("customer") or "").strip() or None
        billing_email = str(_coerce_dict(obj.get("customer_details")).get("email") or "").strip().lower() or None
        if customer_id or billing_email:
            run_async_tool_call(
                control_plane_repository.upsert_workspace_billing_account(
                    workspace_id,
                    billing_email=billing_email,
                    provider_customer_id=customer_id,
                    metadata={"source": "stripe_webhook"},
                )
            )
        status = str(obj.get("status") or "").strip().lower() or "active"
        items = (((obj.get("items") or {}).get("data")) if isinstance(obj.get("items"), dict) else None) or []
        first_item = items[0] if isinstance(items, list) and items else {}
        price = _coerce_dict(_coerce_dict(first_item).get("price"))
        run_async_tool_call(
            control_plane_repository.upsert_workspace_billing_subscription(
                workspace_id,
                plan_id=_plan_id_from_subscription_object(obj),
                status=status,
                provider_subscription_id=str(obj.get("id") or "").strip() or None,
                provider_price_id=str(price.get("id") or "").strip() or None,
                provider_product_id=str(price.get("product") or "").strip() or None,
                provider_customer_id=customer_id,
                currency=str(obj.get("currency") or price.get("currency") or "usd").strip().lower() or "usd",
                billing_interval=str(price.get("recurring", {}).get("interval") if isinstance(price.get("recurring"), dict) else "" or "").strip().lower() or None,
                current_period_start=_coerce_int(obj.get("current_period_start")),
                current_period_end=_coerce_int(obj.get("current_period_end")),
                cancel_at_period_end=bool(obj.get("cancel_at_period_end")),
                canceled_at=_coerce_int(obj.get("canceled_at")),
                trial_ends_at=_coerce_int(obj.get("trial_end")),
                metadata={"source": "stripe_webhook"},
            )
        )
        return {"ok": True, "event_type": event_type, "workspace_id": workspace_id}

    return {"ok": True, "ignored": True, "reason": "unsupported_event_type", "event_type": event_type}


def handle_stripe_webhook(body: bytes, signature_header: str) -> Dict[str, Any]:
    verify_stripe_webhook_signature(body, signature_header)
    try:
        event = json.loads(body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Stripe webhook payload is invalid JSON.") from exc
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Stripe webhook payload is invalid.")
    return apply_stripe_webhook_event(event)
