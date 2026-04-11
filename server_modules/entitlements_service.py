from __future__ import annotations

from dataclasses import asdict, dataclass
import time
from typing import Any, Callable, Dict, Optional

from server_modules import control_plane_repository
from server_modules import run_state_repository
from server_modules.direct_tool_config_service import run_async_tool_call


DEFAULT_PLAN_ID = "personal"
PLAN_ALIASES = {
    "starter": "free",
    "free_personal": "personal",
    "standard": "personal",
    "business": "team",
    "enterprise_plus": "enterprise",
}
TERMINAL_RUN_STATES = {"completed", "failed", "cancelled", "canceled", "timeout", "aborted"}

NON_GATED_CAPABILITIES: Dict[str, bool] = {
    "core_sage_identity": True,
    "basic_specialist_architecture": True,
    "local_runtime_mode": True,
    "byo_provider_mode": True,
}

PLAN_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "free": {
        "label": "Free",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": 60,
        "concurrent_hosted_executions": 1,
        "background_event_triggers_per_hour": 2,
        "background_self_proposed_per_hour": 1,
        "background_runtime_seconds": 15,
        "cloud_memory_storage_mb": 128,
        "cloud_memory_retention_days": 14,
        "sync_depth_days": 7,
        "premium_connectors_enabled": False,
        "team_features_enabled": False,
        "admin_security_features_enabled": False,
        "mobile_push_enabled": False,
        "cloud_services_enabled": True,
        "mobile_app_enabled": False,
        "approvals_enabled": False,
        "artifacts_enabled": False,
        "advanced_features_enabled": False,
        "premium_tools_enabled": False,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
    "personal": {
        "label": "Personal",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": 300,
        "concurrent_hosted_executions": 2,
        "background_event_triggers_per_hour": 4,
        "background_self_proposed_per_hour": 2,
        "background_runtime_seconds": 20,
        "cloud_memory_storage_mb": 512,
        "cloud_memory_retention_days": 30,
        "sync_depth_days": 30,
        "premium_connectors_enabled": False,
        "team_features_enabled": False,
        "admin_security_features_enabled": False,
        "mobile_push_enabled": True,
        "cloud_services_enabled": True,
        "mobile_app_enabled": True,
        "approvals_enabled": True,
        "artifacts_enabled": True,
        "advanced_features_enabled": True,
        "premium_tools_enabled": True,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
    "pro": {
        "label": "Pro",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": 1_500,
        "concurrent_hosted_executions": 4,
        "background_event_triggers_per_hour": 8,
        "background_self_proposed_per_hour": 4,
        "background_runtime_seconds": 30,
        "cloud_memory_storage_mb": 2_048,
        "cloud_memory_retention_days": 90,
        "sync_depth_days": 90,
        "premium_connectors_enabled": True,
        "team_features_enabled": False,
        "admin_security_features_enabled": False,
        "mobile_push_enabled": True,
        "cloud_services_enabled": True,
        "mobile_app_enabled": True,
        "approvals_enabled": True,
        "artifacts_enabled": True,
        "advanced_features_enabled": True,
        "premium_tools_enabled": True,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
    "power": {
        "label": "Power",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": 5_000,
        "concurrent_hosted_executions": 8,
        "background_event_triggers_per_hour": 16,
        "background_self_proposed_per_hour": 8,
        "background_runtime_seconds": 45,
        "cloud_memory_storage_mb": 10_240,
        "cloud_memory_retention_days": 365,
        "sync_depth_days": 365,
        "premium_connectors_enabled": True,
        "team_features_enabled": False,
        "admin_security_features_enabled": True,
        "mobile_push_enabled": True,
        "cloud_services_enabled": True,
        "mobile_app_enabled": True,
        "approvals_enabled": True,
        "artifacts_enabled": True,
        "advanced_features_enabled": True,
        "premium_tools_enabled": True,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
    "team": {
        "label": "Team",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": 12_000,
        "concurrent_hosted_executions": 16,
        "background_event_triggers_per_hour": 24,
        "background_self_proposed_per_hour": 12,
        "background_runtime_seconds": 60,
        "cloud_memory_storage_mb": 20_480,
        "cloud_memory_retention_days": 365,
        "sync_depth_days": 365,
        "premium_connectors_enabled": True,
        "team_features_enabled": True,
        "admin_security_features_enabled": True,
        "mobile_push_enabled": True,
        "cloud_services_enabled": True,
        "mobile_app_enabled": True,
        "approvals_enabled": True,
        "artifacts_enabled": True,
        "advanced_features_enabled": True,
        "premium_tools_enabled": True,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
    "enterprise": {
        "label": "Enterprise",
        "hosted_runtime_enabled": True,
        "hosted_runtime_minutes_monthly": None,
        "concurrent_hosted_executions": 64,
        "background_event_triggers_per_hour": 48,
        "background_self_proposed_per_hour": 24,
        "background_runtime_seconds": 90,
        "cloud_memory_storage_mb": 102_400,
        "cloud_memory_retention_days": 3650,
        "sync_depth_days": 3650,
        "premium_connectors_enabled": True,
        "team_features_enabled": True,
        "admin_security_features_enabled": True,
        "mobile_push_enabled": True,
        "cloud_services_enabled": True,
        "mobile_app_enabled": True,
        "approvals_enabled": True,
        "artifacts_enabled": True,
        "advanced_features_enabled": True,
        "premium_tools_enabled": True,
        "telegram_channel_enabled": True,
        "whatsapp_channel_enabled": True,
    },
}


class EntitlementError(RuntimeError):
    def __init__(
        self,
        *,
        reason: str,
        message: str,
        entitlement_state: Optional[Dict[str, Any]] = None,
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.reason = str(reason or "entitlement_denied").strip() or "entitlement_denied"
        self.message = str(message or "This feature is not available for this workspace.").strip()
        self.entitlement_state = dict(entitlement_state or {})
        self.retry_after_seconds = int(retry_after_seconds or 0) or None


class EntitlementDeniedError(EntitlementError):
    pass


class EntitlementQuotaExceededError(EntitlementError):
    pass


@dataclass(frozen=True)
class WorkspaceEntitlementState:
    plan_id: str
    plan_label: str
    source: str
    entitlements: Dict[str, Any]
    usage: Dict[str, Any]
    non_gated_capabilities: Dict[str, bool]

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def normalize_plan_id(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token in PLAN_ALIASES:
        token = PLAN_ALIASES[token]
    return token if token in PLAN_DEFINITIONS else DEFAULT_PLAN_ID


def _workspace_entitlement_metadata(workspace: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = _coerce_dict(_coerce_dict(workspace).get("metadata"))
    return {
        **_coerce_dict(metadata.get("entitlements")),
        **_coerce_dict(metadata.get("billing")),
    }


def _install_entitlement_metadata(install: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = _coerce_dict(_coerce_dict(install).get("metadata"))
    return {
        **_coerce_dict(metadata.get("entitlements")),
        **_coerce_dict(metadata.get("billing")),
    }


def _merged_usage(workspace: Optional[Dict[str, Any]], install: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    workspace_meta = _workspace_entitlement_metadata(workspace)
    install_meta = _install_entitlement_metadata(install)
    return {
        **_coerce_dict(workspace_meta.get("usage")),
        **_coerce_dict(workspace_meta.get("entitlement_usage")),
        **_coerce_dict(install_meta.get("usage")),
        **_coerce_dict(install_meta.get("entitlement_usage")),
    }


def resolve_workspace_entitlement_state(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
) -> WorkspaceEntitlementState:
    workspace_meta = _workspace_entitlement_metadata(workspace)
    install_meta = _install_entitlement_metadata(install)
    raw_plan = (
        install_meta.get("plan")
        or install_meta.get("plan_id")
        or workspace_meta.get("plan")
        or workspace_meta.get("plan_id")
        or install_meta.get("plan_tier")
        or workspace_meta.get("plan_tier")
    )
    plan_id = normalize_plan_id(raw_plan)
    entitlements = dict(PLAN_DEFINITIONS[plan_id])
    entitlements.update(_coerce_dict(workspace_meta.get("overrides")))
    entitlements.update(_coerce_dict(install_meta.get("overrides")))
    source = "workspace_metadata"
    if install_meta.get("plan") or install_meta.get("plan_id") or install_meta.get("plan_tier"):
        source = "install_metadata"
    elif not raw_plan:
        source = "default"
    return WorkspaceEntitlementState(
        plan_id=plan_id,
        plan_label=str(entitlements.get("label") or plan_id.title()).strip() or plan_id.title(),
        source=source,
        entitlements=entitlements,
        usage=_merged_usage(workspace, install),
        non_gated_capabilities=dict(NON_GATED_CAPABILITIES),
    )


def _load_workspace_record(workspace_id: str) -> Optional[Dict[str, Any]]:
    token = str(workspace_id or "").strip()
    if not token:
        return None
    try:
        payload = run_async_tool_call(control_plane_repository.get_workspace_by_id(token))
    except Exception:
        return None
    return dict(payload) if isinstance(payload, dict) else None


def resolve_workspace_entitlement_state_for_workspace_id(
    *,
    workspace_id: str,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> WorkspaceEntitlementState:
    resolved_workspace = dict(workspace) if isinstance(workspace, dict) else _load_workspace_record(workspace_id)
    return resolve_workspace_entitlement_state(workspace=resolved_workspace, install=install)


def workspace_capability_flags(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
    state: Optional[WorkspaceEntitlementState] = None,
) -> Dict[str, Any]:
    resolved_state = state or resolve_workspace_entitlement_state(workspace=workspace, install=install)
    entitlements = resolved_state.entitlements
    history_window_days = max(1, _coerce_int(entitlements.get("sync_depth_days"), 30))
    return {
        "mobile_app_enabled": bool(entitlements.get("mobile_app_enabled")),
        "mobile_push_enabled": bool(entitlements.get("mobile_push_enabled")),
        "approvals_enabled": bool(entitlements.get("approvals_enabled")),
        "artifacts_enabled": bool(entitlements.get("artifacts_enabled")),
        "advanced_features_enabled": bool(entitlements.get("advanced_features_enabled")),
        "premium_tools_enabled": bool(entitlements.get("premium_tools_enabled")),
        "history_window_days": history_window_days,
        "telegram_channel_enabled": bool(entitlements.get("telegram_channel_enabled")),
        "whatsapp_channel_enabled": bool(entitlements.get("whatsapp_channel_enabled")),
        "channels": {
            "telegram": bool(entitlements.get("telegram_channel_enabled")),
            "whatsapp": bool(entitlements.get("whatsapp_channel_enabled")),
        },
    }


def workspace_entitlement_payload(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
    state: Optional[WorkspaceEntitlementState] = None,
) -> Dict[str, Any]:
    resolved_state = state or resolve_workspace_entitlement_state(workspace=workspace, install=install)
    return {
        **resolved_state.as_dict(),
        "capabilities": workspace_capability_flags(state=resolved_state),
    }


def workspace_entitlement_payload_for_workspace_id(
    *,
    workspace_id: str,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state_for_workspace_id(
        workspace_id=workspace_id,
        workspace=workspace,
        install=install,
    )
    return workspace_entitlement_payload(state=state)


def history_window_cutoff_ts(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
    state: Optional[WorkspaceEntitlementState] = None,
    now_ts: Optional[float] = None,
) -> Optional[float]:
    resolved_state = state or resolve_workspace_entitlement_state(workspace=workspace, install=install)
    history_window_days = max(1, _coerce_int(resolved_state.entitlements.get("sync_depth_days"), 30))
    return float(now_ts if now_ts is not None else time.time()) - float(history_window_days * 86400)


def history_window_cutoff_ts_for_workspace_id(
    *,
    workspace_id: str,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
    now_ts: Optional[float] = None,
) -> Optional[float]:
    state = resolve_workspace_entitlement_state_for_workspace_id(
        workspace_id=workspace_id,
        workspace=workspace,
        install=install,
    )
    return history_window_cutoff_ts(state=state, now_ts=now_ts)


def scheduler_policy_defaults(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    limits = state.entitlements
    return {
        "plan_tier": state.plan_id,
        "max_event_triggers_per_hour": _coerce_int(limits.get("background_event_triggers_per_hour"), 4),
        "max_self_proposed_per_hour": _coerce_int(limits.get("background_self_proposed_per_hour"), 2),
        "max_runtime_seconds": _coerce_int(limits.get("background_runtime_seconds"), 20),
    }


def memory_policy_defaults(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    limits = state.entitlements
    return {
        "plan_tier": state.plan_id,
        "cloud_memory_storage_mb": _coerce_int(limits.get("cloud_memory_storage_mb"), 512),
        "cloud_memory_retention_days": _coerce_int(limits.get("cloud_memory_retention_days"), 30),
        "sync_depth_days": _coerce_int(limits.get("sync_depth_days"), 30),
    }


def connector_policy_defaults(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    limits = state.entitlements
    return {
        "plan_tier": state.plan_id,
        "premium_connectors_enabled": bool(limits.get("premium_connectors_enabled")),
        "team_features_enabled": bool(limits.get("team_features_enabled")),
        "admin_security_features_enabled": bool(limits.get("admin_security_features_enabled")),
    }


def _enforce_workspace_capability(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]],
    entitlement_key: str,
    reason: str,
    message: str,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    if not bool(state.entitlements.get(entitlement_key)):
        raise EntitlementDeniedError(
            reason=reason,
            message=message,
            entitlement_state=workspace_entitlement_payload(state=state),
        )
    return workspace_entitlement_payload(state=state)


def _workspace_hosted_execution_count(
    workspace_id: str,
    *,
    live_runs_fn: Optional[Callable[[], list[Dict[str, Any]]]] = None,
) -> int:
    resolved_workspace_id = str(workspace_id or "").strip()
    if not resolved_workspace_id:
        return 0
    try:
        live_runs = live_runs_fn() if callable(live_runs_fn) else run_state_repository.sync_list_live_runs()
    except Exception:
        live_runs = []
    total = 0
    for item in list(live_runs or []):
        if not isinstance(item, dict):
            continue
        context = _coerce_dict(item.get("context"))
        if str(context.get("workspace_id") or item.get("workspace_id") or "").strip() != resolved_workspace_id:
            continue
        status = str(item.get("status") or "").strip().lower()
        if status in TERMINAL_RUN_STATES:
            continue
        metadata = _coerce_dict(context.get("metadata"))
        if str(metadata.get("runtime_attachment_kind") or "").strip() == "self_hosted_business_node":
            continue
        execution_target = str(metadata.get("execution_target_selected") or "").strip().lower()
        runtime_mode = str(metadata.get("runtime_mode") or item.get("runtime_mode") or "").strip().lower()
        if execution_target == "cloud" or runtime_mode == "hosted_secure":
            total += 1
    return total


def enforce_hosted_runtime_access(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
    workspace_id: str,
    selected_attachment: Optional[Dict[str, Any]] = None,
    live_runs_fn: Optional[Callable[[], list[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    attachment = _coerce_dict(selected_attachment)
    attachment_kind = str(attachment.get("attachment_kind") or "").strip()
    if attachment_kind == "self_hosted_business_node":
        return {
            **state.as_dict(),
            "usage_snapshot": {
                "hosted_runtime_minutes_monthly": _coerce_float(state.usage.get("hosted_runtime_minutes_monthly")) or 0.0,
                "concurrent_hosted_executions": 0,
            },
            "enforcement_target": "self_hosted",
        }
    entitlements = state.entitlements
    if not bool(entitlements.get("hosted_runtime_enabled")):
        raise EntitlementDeniedError(
            reason="hosted_runtime_unavailable",
            message="Hosted cloud execution is not included in the current plan. Local and self-hosted runtimes remain available.",
            entitlement_state=state.as_dict(),
        )
    monthly_minutes_limit = _coerce_float(entitlements.get("hosted_runtime_minutes_monthly"))
    used_minutes = _coerce_float(state.usage.get("hosted_runtime_minutes_monthly")) or 0.0
    if monthly_minutes_limit is not None and used_minutes >= monthly_minutes_limit:
        raise EntitlementQuotaExceededError(
            reason="hosted_runtime_minutes_exhausted",
            message="Hosted runtime minutes are exhausted for this workspace right now. Local and self-hosted runtimes still work.",
            entitlement_state=state.as_dict(),
            retry_after_seconds=3600,
        )
    concurrent_limit = _coerce_int(entitlements.get("concurrent_hosted_executions"), 1)
    active_hosted = _workspace_hosted_execution_count(
        workspace_id,
        live_runs_fn=live_runs_fn,
    )
    if active_hosted >= concurrent_limit:
        raise EntitlementQuotaExceededError(
            reason="hosted_runtime_concurrency_exhausted",
            message="Hosted execution is busy for this workspace right now. Please retry shortly, or use a local/self-hosted runtime if attached.",
            entitlement_state=state.as_dict(),
            retry_after_seconds=30,
        )
    return {
        **state.as_dict(),
        "usage_snapshot": {
            "hosted_runtime_minutes_monthly": used_minutes,
            "concurrent_hosted_executions": active_hosted,
        },
        "enforcement_target": "managed_cloud",
    }


def enforce_mobile_push_access(
    *,
    workspace: Optional[Dict[str, Any]],
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = resolve_workspace_entitlement_state(workspace=workspace, install=install)
    entitlements = state.entitlements
    if not bool(entitlements.get("mobile_push_enabled")) or not bool(entitlements.get("cloud_services_enabled")):
        raise EntitlementDeniedError(
            reason="mobile_push_unavailable",
            message="Mobile push delivery is not included in the current plan. The in-app notification feed still works.",
            entitlement_state=workspace_entitlement_payload(state=state),
        )
    return workspace_entitlement_payload(state=state)


def enforce_mobile_app_access(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return _enforce_workspace_capability(
        workspace=workspace,
        install=install,
        entitlement_key="mobile_app_enabled",
        reason="mobile_app_unavailable",
        message="Mobile app access is available on paid plans only. Use web or Telegram/WhatsApp on the free plan.",
    )


def enforce_approvals_access(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return _enforce_workspace_capability(
        workspace=workspace,
        install=install,
        entitlement_key="approvals_enabled",
        reason="approvals_unavailable",
        message="Approvals are available on paid plans only. Free workspaces can still chat through Telegram or WhatsApp.",
    )


def enforce_artifacts_access(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return _enforce_workspace_capability(
        workspace=workspace,
        install=install,
        entitlement_key="artifacts_enabled",
        reason="artifacts_unavailable",
        message="Artifacts are available on paid plans only. Upgrade the workspace to inspect generated files and previews.",
    )


def enforce_advanced_features_access(
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return _enforce_workspace_capability(
        workspace=workspace,
        install=install,
        entitlement_key="advanced_features_enabled",
        reason="advanced_features_unavailable",
        message="Advanced runtime controls and local companion management are available on paid plans only.",
    )


def enforce_channel_surface_access(
    provider: str,
    *,
    workspace: Optional[Dict[str, Any]] = None,
    install: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    provider_token = str(provider or "").strip().lower()
    key = {
        "telegram": "telegram_channel_enabled",
        "whatsapp": "whatsapp_channel_enabled",
    }.get(provider_token)
    if not key:
        raise EntitlementDeniedError(
            reason="channel_surface_unknown",
            message=f"Unknown channel provider '{provider_token}'.",
            entitlement_state={},
        )
    return _enforce_workspace_capability(
        workspace=workspace,
        install=install,
        entitlement_key=key,
        reason=f"{provider_token}_channel_unavailable",
        message=f"{provider_token.title()} access is not included in the current workspace plan.",
    )
