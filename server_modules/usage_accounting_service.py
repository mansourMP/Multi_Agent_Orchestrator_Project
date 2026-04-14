from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
import uuid

from server_modules import pricing_registry_service


@dataclass(frozen=True)
class UsageAccountingRecord:
    usage_record_id: str
    run_id: Optional[str]
    tenant_id: Optional[str]
    workspace_id: Optional[str]
    deployed_agent_id: Optional[str]
    source_surface: str
    requested_provider: Optional[str]
    effective_provider: Optional[str]
    requested_model: Optional[str]
    effective_model: Optional[str]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Optional[float]
    pricing_known: bool
    pricing_registry_version: str
    pricing_source: Optional[str]
    estimation_mode: str
    completed_at: str
    metadata: Dict[str, Any]

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_optional_text(value: Any) -> Optional[str]:
    token = _normalize_text(value)
    return token or None


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value: Any) -> Optional[float]:
    try:
        return round(float(value), 6)
    except Exception:
        return None


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def masked_cost_band(cost_usd: Optional[float]) -> str:
    if cost_usd is None:
        return "Unknown"
    if cost_usd < 0.001:
        return "< $0.001"
    if cost_usd < 0.01:
        return "$0.001 - $0.01"
    if cost_usd < 0.05:
        return "$0.01 - $0.05"
    if cost_usd < 0.10:
        return "$0.05 - $0.10"
    return ">= $0.10"


def _derive_source_surface(
    *,
    explicit: Optional[str],
    context: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    token = _normalize_text(explicit).lower()
    if token:
        return token
    payload = _coerce_dict(context)
    meta = _coerce_dict(metadata) or _coerce_dict(payload.get("metadata"))
    if _normalize_optional_text(meta.get("deployed_agent_id")):
        return "deployed_agent_channel"
    if _normalize_optional_text(payload.get("workflow_id")):
        return "workflow_graph"
    return "durable_run"


def build_usage_accounting_record(
    *,
    run_id: Optional[str],
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    deployed_agent_id: Optional[str] = None,
    source_surface: Optional[str] = None,
    requested_provider: Optional[str] = None,
    effective_provider: Optional[str] = None,
    requested_model: Optional[str] = None,
    effective_model: Optional[str] = None,
    input_tokens: int,
    output_tokens: int,
    total_tokens: Optional[int] = None,
    estimated_cost_usd: Optional[float] = None,
    estimation_mode: str = "reconstructed",
    completed_at: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    allow_provider_fallback: bool = False,
) -> Dict[str, Any]:
    provider = pricing_registry_service.normalize_provider_id(
        effective_provider or requested_provider or "local_companion"
    ) or "local_companion"
    model = pricing_registry_service.normalize_model_id(
        provider,
        effective_model or requested_model or "unknown-model",
    ) or "unknown-model"
    normalized_requested_provider = pricing_registry_service.normalize_provider_id(
        requested_provider or provider
    ) or None
    normalized_requested_model = _normalize_optional_text(requested_model or model)
    input_value = max(0, _safe_int(input_tokens, 0))
    output_value = max(0, _safe_int(output_tokens, 0))
    total_value = max(input_value + output_value, _safe_int(total_tokens, input_value + output_value))
    pricing_entry = pricing_registry_service.lookup_pricing_entry(provider, model)
    pricing_source = None
    pricing_known = False
    resolved_cost = _safe_float(estimated_cost_usd)
    if pricing_entry is not None:
        pricing_source = pricing_entry.rate.source
        if pricing_entry.rate.input_usd_per_million is not None and pricing_entry.rate.output_usd_per_million is not None:
            pricing_known = True
            if resolved_cost is None:
                resolved_cost = pricing_registry_service.estimate_cost_usd(
                    provider,
                    model,
                    input_value,
                    output_value,
                )
    if resolved_cost is None and allow_provider_fallback:
        fallback = pricing_registry_service.provider_fallback_rate_per_1k(provider)
        fallback_source = str(fallback.get("source") or "").strip()
        fallback_known = fallback_source and fallback_source != "pricing_registry_fallback"
        if fallback_known:
            resolved_cost = round(
                ((input_value / 1000.0) * float(fallback.get("input") or 0.0))
                + ((output_value / 1000.0) * float(fallback.get("output") or 0.0)),
                6,
            )
            pricing_source = fallback_source or pricing_source
            pricing_known = False
    record = UsageAccountingRecord(
        usage_record_id=f"uacct_{_normalize_text(run_id) or uuid.uuid4().hex[:16]}",
        run_id=_normalize_optional_text(run_id),
        tenant_id=_normalize_optional_text(tenant_id),
        workspace_id=_normalize_optional_text(workspace_id),
        deployed_agent_id=_normalize_optional_text(deployed_agent_id),
        source_surface=_derive_source_surface(explicit=source_surface),
        requested_provider=normalized_requested_provider,
        effective_provider=provider,
        requested_model=normalized_requested_model,
        effective_model=model,
        input_tokens=input_value,
        output_tokens=output_value,
        total_tokens=total_value,
        estimated_cost_usd=resolved_cost,
        pricing_known=bool(pricing_known),
        pricing_registry_version=pricing_registry_service.pricing_registry_version(),
        pricing_source=_normalize_optional_text(pricing_source),
        estimation_mode=_normalize_text(estimation_mode).lower() or "reconstructed",
        completed_at=_normalize_optional_text(completed_at) or _utc_now_iso(),
        metadata=_coerce_dict(metadata),
    )
    return record.as_dict()


def usage_projection_from_record(record: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(record or {})
    cost = _safe_float(payload.get("estimated_cost_usd"))
    timestamp = _normalize_optional_text(payload.get("completed_at")) or _utc_now_iso()
    return {
        "provider": _normalize_optional_text(payload.get("effective_provider")),
        "model": _normalize_optional_text(payload.get("effective_model")),
        "prompt_tokens": max(0, _safe_int(payload.get("input_tokens"), 0)),
        "completion_tokens": max(0, _safe_int(payload.get("output_tokens"), 0)),
        "total_tokens": max(0, _safe_int(payload.get("total_tokens"), 0)),
        "input_tokens_est": max(0, _safe_int(payload.get("input_tokens"), 0)),
        "output_tokens_est": max(0, _safe_int(payload.get("output_tokens"), 0)),
        "total_tokens_est": max(0, _safe_int(payload.get("total_tokens"), 0)),
        "estimated_cost_usd": cost,
        "cost_est_usd": cost,
        "cost_band": masked_cost_band(cost),
        "pricing_known": bool(payload.get("pricing_known")),
        "pricing_source": _normalize_optional_text(payload.get("pricing_source")),
        "pricing_registry_version": _normalize_optional_text(payload.get("pricing_registry_version")),
        "estimation_mode": _normalize_optional_text(payload.get("estimation_mode")) or "reconstructed",
        "source_surface": _normalize_optional_text(payload.get("source_surface")) or "durable_run",
        "usage_record_id": _normalize_optional_text(payload.get("usage_record_id")),
        "run_id": _normalize_optional_text(payload.get("run_id")),
        "timestamp": timestamp,
        "usage_accounting": payload,
    }


def build_masked_usage(
    provider: str,
    model: str,
    input_text: str,
    output_text: str,
    *,
    run_id: Optional[str] = None,
    source_surface: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    input_tokens = estimate_tokens(input_text)
    output_tokens = estimate_tokens(output_text)
    record = build_usage_accounting_record(
        run_id=run_id,
        requested_provider=provider,
        effective_provider=provider,
        requested_model=model,
        effective_model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        estimation_mode="masked_text_estimate",
        source_surface=source_surface or "durable_run",
        metadata=metadata,
        allow_provider_fallback=True,
    )
    return usage_projection_from_record(record)


def accounting_record_from_snapshot(snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(snapshot, dict):
        return None
    direct = snapshot.get("usage_accounting") if isinstance(snapshot.get("usage_accounting"), dict) else None
    if isinstance(direct, dict) and direct:
        return build_usage_accounting_record(
            run_id=_normalize_optional_text(direct.get("run_id") or snapshot.get("run_id")),
            tenant_id=_normalize_optional_text(direct.get("tenant_id") or _coerce_dict(snapshot.get("context")).get("tenant_id")),
            workspace_id=_normalize_optional_text(direct.get("workspace_id") or _coerce_dict(snapshot.get("context")).get("workspace_id")),
            deployed_agent_id=_normalize_optional_text(direct.get("deployed_agent_id") or _coerce_dict(_coerce_dict(snapshot.get("context")).get("metadata")).get("deployed_agent_id")),
            source_surface=_normalize_optional_text(direct.get("source_surface")),
            requested_provider=direct.get("requested_provider"),
            effective_provider=direct.get("effective_provider"),
            requested_model=direct.get("requested_model"),
            effective_model=direct.get("effective_model"),
            input_tokens=_safe_int(direct.get("input_tokens"), 0),
            output_tokens=_safe_int(direct.get("output_tokens"), 0),
            total_tokens=_safe_int(direct.get("total_tokens"), 0),
            estimated_cost_usd=_safe_float(direct.get("estimated_cost_usd")),
            estimation_mode=_normalize_optional_text(direct.get("estimation_mode")) or "reconstructed",
            completed_at=_normalize_optional_text(direct.get("completed_at") or snapshot.get("completed_at") or snapshot.get("updated_at") or snapshot.get("created_at")),
            metadata=_coerce_dict(direct.get("metadata")),
        )
    usage = snapshot.get("usage_masked") if isinstance(snapshot.get("usage_masked"), dict) else {}
    if isinstance(usage.get("usage_accounting"), dict):
        return accounting_record_from_snapshot(
            {
                **snapshot,
                "usage_accounting": usage.get("usage_accounting"),
            }
        )
    provider = usage.get("provider") or snapshot.get("usage_provider")
    model = usage.get("model") or snapshot.get("usage_model")
    if not provider or not model:
        return None
    context = _coerce_dict(snapshot.get("context"))
    metadata = _coerce_dict(context.get("metadata"))
    return build_usage_accounting_record(
        run_id=_normalize_optional_text(snapshot.get("run_id") or usage.get("run_id")),
        tenant_id=_normalize_optional_text(context.get("tenant_id") or snapshot.get("tenant_id")),
        workspace_id=_normalize_optional_text(context.get("workspace_id") or snapshot.get("workspace_id")),
        deployed_agent_id=_normalize_optional_text(metadata.get("deployed_agent_id") or snapshot.get("deployed_agent_id")),
        source_surface=_derive_source_surface(
            explicit=_normalize_optional_text(usage.get("source_surface") or snapshot.get("source_surface")),
            context=context,
            metadata=metadata,
        ),
        requested_provider=usage.get("requested_provider") or provider,
        effective_provider=provider,
        requested_model=usage.get("requested_model") or model,
        effective_model=model,
        input_tokens=_safe_int(usage.get("prompt_tokens", usage.get("input_tokens_est", 0)), 0),
        output_tokens=_safe_int(usage.get("completion_tokens", usage.get("output_tokens_est", 0)), 0),
        total_tokens=_safe_int(usage.get("total_tokens", usage.get("total_tokens_est", 0)), 0),
        estimated_cost_usd=_safe_float(usage.get("estimated_cost_usd", usage.get("cost_est_usd"))),
        estimation_mode=_normalize_optional_text(usage.get("estimation_mode")) or "reconstructed",
        completed_at=_normalize_optional_text(usage.get("timestamp") or snapshot.get("completed_at") or snapshot.get("updated_at") or snapshot.get("created_at")),
        metadata={
            **_coerce_dict(usage.get("metadata")),
            "pricing_registry_version": usage.get("pricing_registry_version"),
            "pricing_source": usage.get("pricing_source"),
            "pricing_known": usage.get("pricing_known"),
        },
    )


def usage_row_from_record(record: Dict[str, Any], *, snapshot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = dict(record or {})
    origin = _coerce_dict(snapshot)
    row = {
        "usage_record_id": _normalize_optional_text(payload.get("usage_record_id")),
        "run_id": _normalize_optional_text(payload.get("run_id") or origin.get("run_id")),
        "tenant_id": _normalize_optional_text(payload.get("tenant_id") or origin.get("tenant_id")),
        "workspace_id": _normalize_optional_text(payload.get("workspace_id") or origin.get("workspace_id")),
        "deployed_agent_id": _normalize_optional_text(payload.get("deployed_agent_id") or origin.get("deployed_agent_id")),
        "source_surface": _normalize_optional_text(payload.get("source_surface")) or "durable_run",
        "requested_provider": _normalize_optional_text(payload.get("requested_provider")),
        "provider": _normalize_optional_text(payload.get("effective_provider")),
        "requested_model": _normalize_optional_text(payload.get("requested_model")),
        "model": _normalize_optional_text(payload.get("effective_model")),
        "prompt_tokens": max(0, _safe_int(payload.get("input_tokens"), 0)),
        "completion_tokens": max(0, _safe_int(payload.get("output_tokens"), 0)),
        "total_tokens": max(0, _safe_int(payload.get("total_tokens"), 0)),
        "estimated_cost_usd": _safe_float(payload.get("estimated_cost_usd")),
        "cost_est_usd": _safe_float(payload.get("estimated_cost_usd")),
        "cost_band": masked_cost_band(_safe_float(payload.get("estimated_cost_usd"))),
        "pricing_known": bool(payload.get("pricing_known")),
        "pricing_registry_version": _normalize_optional_text(payload.get("pricing_registry_version")),
        "pricing_source": _normalize_optional_text(payload.get("pricing_source")),
        "estimation_mode": _normalize_optional_text(payload.get("estimation_mode")) or "reconstructed",
        "timestamp": _normalize_optional_text(payload.get("completed_at")) or _utc_now_iso(),
        "created_at": _normalize_optional_text(origin.get("created_at")),
        "completed_at": _normalize_optional_text(origin.get("completed_at") or payload.get("completed_at")),
        "status": _normalize_optional_text(origin.get("status")),
        "owner_user_id": _normalize_optional_text(origin.get("owner_user_id")),
        "run_name": _normalize_optional_text(origin.get("user_goal") or origin.get("result_summary")) or _normalize_optional_text(payload.get("run_id")),
        "metadata": _coerce_dict(payload.get("metadata")),
    }
    return row


def usage_row_from_snapshot(snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    record = accounting_record_from_snapshot(snapshot)
    if record is None:
        return None
    row = usage_row_from_record(record, snapshot=snapshot)
    return row if row.get("run_id") else None


def summarize_provider_model_cost_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}
    total_cost = 0.0
    for row in list(rows or []):
        if not isinstance(row, dict):
            continue
        provider = _normalize_text(row.get("provider") or row.get("effective_provider") or "unknown").lower() or "unknown"
        model = _normalize_text(row.get("model") or row.get("effective_model") or "unknown") or "unknown"
        key = (provider, model)
        if key not in grouped:
            grouped[key] = {
                "provider": provider,
                "model": model,
                "runs_count": 0,
                "total_tokens": 0,
                "total_cost_usd": 0.0,
            }
        cost_value = float(row.get("estimated_cost_usd") or 0.0)
        grouped[key]["runs_count"] = int(grouped[key]["runs_count"] or 0) + int(row.get("runs_count") or 1)
        grouped[key]["total_tokens"] = int(grouped[key]["total_tokens"] or 0) + int(row.get("total_tokens") or 0)
        grouped[key]["total_cost_usd"] = round(float(grouped[key]["total_cost_usd"] or 0.0) + cost_value, 6)
        total_cost += cost_value
    items = list(grouped.values())
    items.sort(
        key=lambda item: (
            -float(item.get("total_cost_usd") or 0.0),
            -int(item.get("runs_count") or 0),
            str(item.get("provider") or ""),
            str(item.get("model") or ""),
        )
    )
    denominator = total_cost if total_cost > 0 else 0.0
    for item in items:
        cost_value = float(item.get("total_cost_usd") or 0.0)
        item["share_percent"] = round((cost_value / denominator) * 100.0, 2) if denominator > 0 else 0.0
    return items
