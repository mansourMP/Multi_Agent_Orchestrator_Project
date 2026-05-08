from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

from server_modules import empyralis_model_tier_contract


CREDIT_LEDGER_ITEM_TYPES: tuple[str, ...] = (
    "ai_light_tokens",
    "ai_pro_tokens",
    "ai_max_tokens",
    "local_ai_tokens",
    "custom_api_key_usage",
    "virtual_browser_minutes",
    "virtual_desktop_minutes",
    "virtual_code_sandbox_minutes",
    "artifact_storage",
    "snapshot_storage",
    "gateway_relay",
    "channel_message",
)

_TOKEN_ITEM_TYPES = {"ai_light_tokens", "ai_pro_tokens", "ai_max_tokens", "local_ai_tokens"}
_MINUTE_ITEM_TYPES = {"virtual_browser_minutes", "virtual_desktop_minutes", "virtual_code_sandbox_minutes"}


@dataclass(frozen=True)
class CreditLedgerLineItem:
    credit_item_type: str
    quantity: float
    quantity_unit: str
    billing_source: str
    public_tier: Optional[str]
    credit_multiplier: float

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["quantity"] = round(float(payload.get("quantity") or 0.0), 6)
        payload["credit_multiplier"] = round(float(payload.get("credit_multiplier") or 0.0), 6)
        return payload


def _text(value: Any) -> str:
    return str(value or "").strip()


def _token_count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except Exception:
        return 0


def _float_count(value: Any) -> float:
    try:
        return max(0.0, round(float(value or 0.0), 6))
    except Exception:
        return 0.0


def _normalize_tier(value: Any) -> Optional[str]:
    token = _text(value).lower().replace("-", "_")
    return token if token in empyralis_model_tier_contract.EMPYRALIS_MODEL_TIERS else None


def _runtime_item_type(runtime_type: Any) -> Optional[str]:
    token = _text(runtime_type).lower().replace("-", "_")
    if token in {"virtual_browser", "browser", "cloud_browser"}:
        return "virtual_browser_minutes"
    if token in {"virtual_desktop", "desktop", "cloud_desktop"}:
        return "virtual_desktop_minutes"
    if token in {"virtual_code_sandbox", "code_sandbox", "sandbox"}:
        return "virtual_code_sandbox_minutes"
    return None


def _tier_item_type(public_tier: Optional[str], billing_source: str) -> str:
    if public_tier == "light":
        return "ai_light_tokens"
    if public_tier == "pro":
        return "ai_pro_tokens"
    if public_tier == "max":
        return "ai_max_tokens"
    if public_tier == "local_ai":
        return "local_ai_tokens"
    if public_tier in {"my_api_key", "my_ai_account"}:
        return "custom_api_key_usage"
    if billing_source == "local_runtime":
        return "local_ai_tokens"
    if billing_source in {"user_api_key", "user_ai_account"}:
        return "custom_api_key_usage"
    return "ai_pro_tokens"


def _default_multiplier_for_item_type(item_type: str) -> float:
    if item_type == "ai_light_tokens":
        return 0.5
    if item_type == "ai_max_tokens":
        return 2.0
    if item_type == "ai_pro_tokens":
        return 1.0
    return 0.0


def build_credit_ledger_line_item(
    *,
    metadata: Optional[Dict[str, Any]] = None,
    public_tier: Any = None,
    billing_source: Any = None,
    credit_multiplier: Any = None,
    total_tokens: Any = None,
    runtime_minutes: Any = None,
) -> Dict[str, Any]:
    payload = dict(metadata or {}) if isinstance(metadata, dict) else {}
    explicit_item_type = _text(payload.get("credit_item_type")).lower()
    item_type = explicit_item_type if explicit_item_type in CREDIT_LEDGER_ITEM_TYPES else None

    resolved_tier = (
        _normalize_tier(public_tier)
        or _normalize_tier(payload.get("public_tier"))
        or _normalize_tier(payload.get("model_tier"))
        or _normalize_tier(payload.get("empyralis_model_tier"))
    )
    resolved_billing_source = _text(
        billing_source
        or payload.get("billing_source")
        or (empyralis_model_tier_contract.model_tier_contract(resolved_tier).billing_source if resolved_tier else "")
    ).lower() or "empyralis_credits"

    runtime_type = payload.get("runtime_type") or payload.get("runtime_kind")
    if item_type is None and runtime_type:
        item_type = _runtime_item_type(runtime_type)
    if item_type is None:
        item_type = _tier_item_type(resolved_tier, resolved_billing_source)

    if credit_multiplier is None:
        if resolved_tier:
            resolved_credit_multiplier = float(
                empyralis_model_tier_contract.model_tier_contract(resolved_tier).credit_multiplier
            )
        else:
            resolved_credit_multiplier = _default_multiplier_for_item_type(item_type)
    else:
        resolved_credit_multiplier = _float_count(credit_multiplier)

    quantity = _float_count(payload.get("credit_quantity"))
    if quantity <= 0.0:
        if item_type in _TOKEN_ITEM_TYPES:
            quantity = float(_token_count(total_tokens))
        elif item_type in _MINUTE_ITEM_TYPES:
            quantity = _float_count(runtime_minutes or payload.get("runtime_minutes"))
        elif item_type == "channel_message":
            quantity = float(max(1, _token_count(payload.get("message_count"))))
        elif item_type == "gateway_relay":
            quantity = _float_count(payload.get("relay_events") or 1.0)
        elif item_type in {"artifact_storage", "snapshot_storage"}:
            quantity = _float_count(payload.get("storage_mb"))
        else:
            quantity = 1.0

    if item_type in _TOKEN_ITEM_TYPES:
        quantity_unit = "tokens"
    elif item_type in _MINUTE_ITEM_TYPES:
        quantity_unit = "minutes"
    elif item_type in {"artifact_storage", "snapshot_storage"}:
        quantity_unit = "mb"
    elif item_type == "channel_message":
        quantity_unit = "messages"
    elif item_type == "gateway_relay":
        quantity_unit = "relay_events"
    else:
        quantity_unit = "events"

    line_item = CreditLedgerLineItem(
        credit_item_type=item_type,
        quantity=quantity,
        quantity_unit=quantity_unit,
        billing_source=resolved_billing_source,
        public_tier=resolved_tier,
        credit_multiplier=resolved_credit_multiplier,
    ).to_dict()

    return {
        **payload,
        **line_item,
    }
