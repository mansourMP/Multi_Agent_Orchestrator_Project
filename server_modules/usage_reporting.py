from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

QWEN_CNY_PER_USD = 7.108
QWEN_USD_PER_CNY = 1.0 / QWEN_CNY_PER_USD

# Official pricing sources used for the current table:
# - OpenAI: https://openai.com/api/pricing/ and https://platform.openai.com/pricing
# - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models/all-models
# - Gemini: https://ai.google.dev/gemini-api/docs/pricing
# - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing/ and pricing-details-usd
# - Mistral: https://docs.mistral.ai/models/
# - Qwen: https://help.aliyun.com/zh/model-studio/getting-started/models
MODEL_PRICING_USD_PER_MILLION: Dict[str, Dict[str, Dict[str, Any]]] = {
    "codex_cli": {
        "gpt-5.4": {"input": None, "output": None, "source": "subscription_cli"},
    },
    "claude_code_cli": {
        "sonnet": {"input": None, "output": None, "source": "subscription_cli"},
    },
    "openai": {
        "gpt-5.4": {"input": 2.50, "output": 15.00, "source": "https://openai.com/api/pricing/"},
        "gpt-5.4-mini": {"input": 0.75, "output": 4.50, "source": "https://openai.com/api/pricing/"},
        "gpt-5.4-nano": {"input": 0.20, "output": 1.25, "source": "https://openai.com/api/pricing/"},
        "gpt-4.1": {"input": 2.00, "output": 8.00, "source": "https://platform.openai.com/pricing"},
        "gpt-4.1-mini": {"input": 0.40, "output": 1.60, "source": "https://platform.openai.com/pricing"},
        "gpt-4.1-nano": {"input": 0.10, "output": 0.40, "source": "https://platform.openai.com/pricing"},
        "gpt-4": {"input": 30.00, "output": 60.00, "source": "https://platform.openai.com/docs/models/gpt-4"},
    },
    "anthropic": {
        "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00, "source": "https://docs.anthropic.com/en/docs/about-claude/models/all-models"},
        "claude-3-7-sonnet": {"input": 3.00, "output": 15.00, "source": "https://docs.anthropic.com/en/docs/about-claude/models/all-models"},
        "claude-sonnet-4": {"input": 3.00, "output": 15.00, "source": "https://docs.anthropic.com/en/docs/about-claude/models/all-models"},
        "claude-haiku-4.5": {"input": 1.00, "output": 5.00, "source": "https://www.anthropic.com/claude/haiku?m=1"},
    },
    "gemini": {
        "gemini-2.0-flash": {"input": 0.10, "output": 0.40, "source": "https://ai.google.dev/gemini-api/docs/pricing"},
        "gemini-2.0-flash-001": {"input": 0.10, "output": 0.40, "source": "https://ai.google.dev/gemini-api/docs/pricing"},
    },
    "ollama": {
        "llama3": {"input": None, "output": None, "source": "local_runtime"},
        "llama3.1:8b": {"input": None, "output": None, "source": "local_runtime"},
        "mistral": {"input": None, "output": None, "source": "local_runtime"},
        "gemma": {"input": None, "output": None, "source": "local_runtime"},
        "phi3": {"input": None, "output": None, "source": "local_runtime"},
    },
    "qwen": {
        # Alibaba publishes these prices in CNY. They are converted here to USD using
        # a current mid-market USD/CNY rate for reporting consistency.
        "qwen-turbo": {
            "input": round(0.3 * QWEN_USD_PER_CNY, 6),
            "output": round(0.6 * QWEN_USD_PER_CNY, 6),
            "source": "https://help.aliyun.com/zh/model-studio/getting-started/models",
        },
        "qwen-plus": {
            "input": round(2.936 * QWEN_USD_PER_CNY, 6),
            "output": round(8.807 * QWEN_USD_PER_CNY, 6),
            "source": "https://help.aliyun.com/zh/model-studio/getting-started/models",
        },
        "qwen-max": {
            "input": round(40.0 * QWEN_USD_PER_CNY, 6),
            "output": round(120.0 * QWEN_USD_PER_CNY, 6),
            "source": "https://help.aliyun.com/zh/model-studio/getting-started/models",
        },
    },
    "deepseek": {
        "deepseek-chat": {"input": 0.27, "output": 1.10, "source": "https://api-docs.deepseek.com/quick_start/pricing-details-usd"},
        "deepseek-reasoner": {"input": 0.55, "output": 2.19, "source": "https://api-docs.deepseek.com/quick_start/pricing-details-usd"},
    },
    "mistral": {
        "mistral-small-latest": {"input": 0.10, "output": 0.30, "source": "https://docs.mistral.ai/models/mistral-small-3-2-25-06"},
        "mistral-medium-latest": {"input": 0.40, "output": 2.00, "source": "https://docs.mistral.ai/models/mistral-medium-3-1-25-08"},
        "mistral-large-latest": {"input": 0.50, "output": 1.50, "source": "https://docs.mistral.ai/models/mistral-large-3-25-12"},
    },
    "local_companion": {
        "local-worker-v0": {"input": None, "output": None, "source": "local_runtime"},
    },
    "orion": {},
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw).astimezone(timezone.utc)
    except Exception:
        return None


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except Exception:
        return None


def normalize_provider_id(provider: Any) -> str:
    return str(provider or "").strip().lower()


def normalize_model_id(provider: Any, model: Any) -> str:
    provider_id = normalize_provider_id(provider)
    model_id = str(model or "").strip().lower().replace(" ", "-")
    if provider_id == "openai":
        aliases = {
            "gpt-5.4-mini": "gpt-5.4-mini",
            "gpt-5.4-nano": "gpt-5.4-nano",
            "gpt-4-0613": "gpt-4",
            "gpt-4-0314": "gpt-4",
        }
        return aliases.get(model_id, model_id)
    if provider_id == "anthropic":
        aliases = {
            "claude-sonnet-3.5": "claude-3-5-sonnet-20241022",
            "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
            "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
        }
        return aliases.get(model_id, model_id)
    if provider_id == "gemini" and model_id == "gemini-2.0-flash-001":
        return "gemini-2.0-flash-001"
    if provider_id == "mistral":
        aliases = {
            "mistral-small-3.2": "mistral-small-latest",
            "mistral-medium-3.1": "mistral-medium-latest",
            "mistral-large-3": "mistral-large-latest",
        }
        return aliases.get(model_id, model_id)
    return model_id


def lookup_model_pricing(provider: Any, model: Any) -> Optional[Dict[str, Any]]:
    provider_id = normalize_provider_id(provider)
    model_id = normalize_model_id(provider_id, model)
    return MODEL_PRICING_USD_PER_MILLION.get(provider_id, {}).get(model_id)


def masked_cost_band(cost_usd: Optional[float]) -> str:
    if cost_usd is None:
        return "Unknown"
    if cost_usd <= 0:
        return "$0.00"
    if cost_usd < 0.01:
        return "$0.00 - $0.01"
    if cost_usd < 0.05:
        return "$0.01 - $0.05"
    if cost_usd < 0.10:
        return "$0.05 - $0.10"
    return "$0.10+"


def estimate_cost_usd(provider: Any, model: Any, prompt_tokens: int, completion_tokens: int) -> Optional[float]:
    pricing = lookup_model_pricing(provider, model)
    if not isinstance(pricing, dict):
        return None
    input_price = pricing.get("input")
    output_price = pricing.get("output")
    if input_price is None or output_price is None:
        return None
    total = (max(0, int(prompt_tokens)) * float(input_price) / 1_000_000.0) + (
        max(0, int(completion_tokens)) * float(output_price) / 1_000_000.0
    )
    return round(total, 6)


def build_usage_record(
    provider: Any,
    model: Any,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: Optional[int] = None,
    *,
    run_id: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    provider_id = normalize_provider_id(provider) or "local_companion"
    model_id = str(model or "unknown-model").strip() or "unknown-model"
    prompt_value = max(0, int(prompt_tokens))
    completion_value = max(0, int(completion_tokens))
    total_value = max(prompt_value + completion_value, int(total_tokens or 0))
    estimated_cost = estimate_cost_usd(provider_id, model_id, prompt_value, completion_value)
    pricing = lookup_model_pricing(provider_id, model_id)
    return {
        "provider": provider_id,
        "model": model_id,
        "prompt_tokens": prompt_value,
        "completion_tokens": completion_value,
        "total_tokens": total_value,
        "input_tokens_est": prompt_value,
        "output_tokens_est": completion_value,
        "total_tokens_est": total_value,
        "estimated_cost_usd": estimated_cost,
        "cost_est_usd": estimated_cost,
        "cost_band": masked_cost_band(estimated_cost),
        "pricing_known": estimated_cost is not None,
        "pricing_source": pricing.get("source") if isinstance(pricing, dict) else None,
        "run_id": str(run_id or "").strip() or None,
        "timestamp": str(timestamp or "").strip() or _utc_now_iso(),
    }


def enrich_usage_record(usage: Dict[str, Any], *, run_id: Optional[str] = None, timestamp: Optional[str] = None) -> Dict[str, Any]:
    provider = usage.get("provider")
    model = usage.get("model")
    prompt_tokens = _safe_int(
        usage.get("prompt_tokens", usage.get("input_tokens_est", 0)),
        0,
    )
    completion_tokens = _safe_int(
        usage.get("completion_tokens", usage.get("output_tokens_est", 0)),
        0,
    )
    total_tokens = _safe_int(
        usage.get("total_tokens", usage.get("total_tokens_est", prompt_tokens + completion_tokens)),
        prompt_tokens + completion_tokens,
    )
    merged = build_usage_record(
        provider,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        run_id=str(run_id or usage.get("run_id") or "").strip() or None,
        timestamp=str(timestamp or usage.get("timestamp") or "").strip() or None,
    )
    for key, value in usage.items():
        if key not in merged:
            merged[key] = value
    return merged


def usage_row_from_snapshot(snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    usage = snapshot.get("usage_masked") if isinstance(snapshot.get("usage_masked"), dict) else {}
    if not isinstance(usage, dict):
        usage = {}
    provider = usage.get("provider") or snapshot.get("usage_provider")
    model = usage.get("model") or snapshot.get("usage_model")
    if not provider or not model:
        return None
    prompt_tokens = _safe_int(usage.get("prompt_tokens", usage.get("input_tokens_est", 0)), 0)
    completion_tokens = _safe_int(usage.get("completion_tokens", usage.get("output_tokens_est", 0)), 0)
    total_tokens = _safe_int(
        usage.get("total_tokens", usage.get("total_tokens_est", prompt_tokens + completion_tokens)),
        prompt_tokens + completion_tokens,
    )
    estimated_cost = _safe_float(usage.get("estimated_cost_usd"))
    if estimated_cost is None:
        estimated_cost = _safe_float(usage.get("cost_est_usd"))
    if estimated_cost is None:
        estimated_cost = estimate_cost_usd(provider, model, prompt_tokens, completion_tokens)
    timestamp = (
        str(usage.get("timestamp") or "").strip()
        or str(snapshot.get("completed_at") or "").strip()
        or str(snapshot.get("updated_at") or "").strip()
        or str(snapshot.get("created_at") or "").strip()
        or _utc_now_iso()
    )
    row = enrich_usage_record(
        usage,
        run_id=str(snapshot.get("run_id") or usage.get("run_id") or "").strip() or None,
        timestamp=timestamp,
    )
    if estimated_cost is not None:
        row["estimated_cost_usd"] = round(float(estimated_cost), 6)
        row["cost_est_usd"] = row["estimated_cost_usd"]
        row["cost_band"] = masked_cost_band(row["estimated_cost_usd"])
        row["pricing_known"] = True
    row["run_id"] = str(snapshot.get("run_id") or row.get("run_id") or "").strip()
    row["status"] = str(snapshot.get("status") or "").strip() or None
    row["owner_user_id"] = str(snapshot.get("owner_user_id") or "").strip() or None
    row["run_name"] = (
        str(snapshot.get("user_goal") or "").strip()
        or str(snapshot.get("result_summary") or "").strip()
        or row["run_id"]
    )
    row["created_at"] = str(snapshot.get("created_at") or "").strip() or None
    row["completed_at"] = str(snapshot.get("completed_at") or "").strip() or None
    return row if row["run_id"] else None


def _period_floor(period: str, now: Optional[datetime] = None) -> Optional[datetime]:
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    normalized = str(period or "all").strip().lower()
    if normalized == "day":
        return reference.replace(hour=0, minute=0, second=0, microsecond=0)
    if normalized == "week":
        midnight = reference.replace(hour=0, minute=0, second=0, microsecond=0)
        return midnight - timedelta(days=midnight.weekday())
    if normalized == "month":
        return reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return None


def filter_usage_rows(rows: Iterable[Dict[str, Any]], period: str, *, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    floor = _period_floor(period, now=now)
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if floor is None:
            out.append(row)
            continue
        ts = _parse_timestamp(row.get("timestamp") or row.get("completed_at") or row.get("created_at"))
        if ts is None or ts >= floor:
            out.append(row)
    return out


def _dedupe_usage_rows(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_run: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
    for row in rows:
        if not isinstance(row, dict):
            continue
        run_id = str(row.get("run_id") or "").strip()
        if not run_id:
            continue
        by_run[run_id] = row
    return list(by_run.values())


def aggregate_usage_summary(
    snapshots: Iterable[Dict[str, Any]],
    period: str = "all",
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    rows = _dedupe_usage_rows(
        usage_row_from_snapshot(snapshot)  # type: ignore[arg-type]
        for snapshot in snapshots
        if isinstance(snapshot, dict)
    )
    filtered = filter_usage_rows(rows, period, now=now)
    total_tokens = sum(_safe_int(item.get("total_tokens"), 0) for item in filtered)
    total_cost = round(
        sum(_safe_float(item.get("estimated_cost_usd")) or 0.0 for item in filtered),
        6,
    )

    by_provider: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[Tuple[str, str], Dict[str, Any]] = {}
    daily: Dict[str, Dict[str, Any]] = {}

    for item in filtered:
        provider = str(item.get("provider") or "unknown").strip() or "unknown"
        model = str(item.get("model") or "unknown-model").strip() or "unknown-model"
        tokens = _safe_int(item.get("total_tokens"), 0)
        cost = round(_safe_float(item.get("estimated_cost_usd")) or 0.0, 6)
        provider_bucket = by_provider.setdefault(
            provider,
            {"provider": provider, "total_tokens": 0, "total_cost_usd": 0.0, "runs_count": 0},
        )
        provider_bucket["total_tokens"] += tokens
        provider_bucket["total_cost_usd"] = round(float(provider_bucket["total_cost_usd"]) + cost, 6)
        provider_bucket["runs_count"] += 1

        model_bucket = by_model.setdefault(
            (provider, model),
            {"provider": provider, "model": model, "total_tokens": 0, "total_cost_usd": 0.0, "runs_count": 0},
        )
        model_bucket["total_tokens"] += tokens
        model_bucket["total_cost_usd"] = round(float(model_bucket["total_cost_usd"]) + cost, 6)
        model_bucket["runs_count"] += 1

        ts = _parse_timestamp(item.get("timestamp") or item.get("completed_at") or item.get("created_at"))
        day_key = (ts or (now or datetime.now(timezone.utc))).astimezone(timezone.utc).date().isoformat()
        day_bucket = daily.setdefault(day_key, {"date": day_key, "total_tokens": 0, "total_cost_usd": 0.0, "runs_count": 0})
        day_bucket["total_tokens"] += tokens
        day_bucket["total_cost_usd"] = round(float(day_bucket["total_cost_usd"]) + cost, 6)
        day_bucket["runs_count"] += 1

    provider_items = sorted(by_provider.values(), key=lambda item: (-int(item["total_tokens"]), str(item["provider"])))
    for provider_item in provider_items:
        provider_item["percentage"] = round(
            (float(provider_item["total_tokens"]) / float(total_tokens)) * 100.0,
            2,
        ) if total_tokens > 0 else 0.0

    model_items = sorted(
        by_model.values(),
        key=lambda item: (-int(item["total_tokens"]), str(item["provider"]), str(item["model"])),
    )
    run_items = sorted(
        filtered,
        key=lambda item: (-_safe_int(item.get("total_tokens"), 0), str(item.get("timestamp") or "")),
    )
    daily_items = sorted(daily.values(), key=lambda item: str(item["date"]))

    return {
        "period": str(period or "all").strip().lower() or "all",
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "runs_count": len(filtered),
        "by_provider": provider_items,
        "by_model": model_items,
        "by_run": run_items[:10],
        "daily": daily_items,
    }


def list_usage_runs(
    snapshots: Iterable[Dict[str, Any]],
    *,
    period: str = "all",
    limit: int = 50,
    offset: int = 0,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    rows = _dedupe_usage_rows(
        usage_row_from_snapshot(snapshot)  # type: ignore[arg-type]
        for snapshot in snapshots
        if isinstance(snapshot, dict)
    )
    filtered = filter_usage_rows(rows, period, now=now)
    ordered = sorted(
        filtered,
        key=lambda item: (-_safe_int(item.get("total_tokens"), 0), str(item.get("timestamp") or "")),
    )
    safe_limit = max(1, min(int(limit), 200))
    safe_offset = max(0, int(offset))
    sliced = ordered[safe_offset:safe_offset + safe_limit]
    return {
        "items": sliced,
        "count": len(sliced),
        "total": len(ordered),
        "limit": safe_limit,
        "offset": safe_offset,
        "period": str(period or "all").strip().lower() or "all",
    }
