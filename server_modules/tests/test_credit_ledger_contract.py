from __future__ import annotations

from server_modules import credit_ledger_contract


def test_hosted_light_tier_maps_to_light_token_line_item() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        public_tier="light",
        billing_source="empyralis_credits",
        total_tokens=2400,
    )

    assert item["credit_item_type"] == "ai_light_tokens"
    assert item["quantity"] == 2400.0
    assert item["quantity_unit"] == "tokens"
    assert item["billing_source"] == "empyralis_credits"
    assert item["credit_multiplier"] == 0.5


def test_hosted_max_tier_maps_to_max_token_line_item() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        public_tier="max",
        billing_source="empyralis_credits",
        total_tokens=900,
    )

    assert item["credit_item_type"] == "ai_max_tokens"
    assert item["credit_multiplier"] == 2.0
    assert item["quantity"] == 900.0


def test_local_ai_maps_without_hosted_credit_spend() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        public_tier="local_ai",
        billing_source="local_runtime",
        total_tokens=1200,
    )

    assert item["credit_item_type"] == "local_ai_tokens"
    assert item["billing_source"] == "local_runtime"
    assert item["credit_multiplier"] == 0.0


def test_my_api_key_maps_to_custom_usage_item() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        public_tier="my_api_key",
        billing_source="user_api_key",
        total_tokens=500,
    )

    assert item["credit_item_type"] == "custom_api_key_usage"
    assert item["billing_source"] == "user_api_key"
    assert item["quantity_unit"] == "events"


def test_virtual_runtime_minutes_use_runtime_line_items() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        metadata={"runtime_type": "virtual_browser"},
        runtime_minutes=17.5,
        billing_source="virtual_runtime_credits",
    )

    assert item["credit_item_type"] == "virtual_browser_minutes"
    assert item["quantity"] == 17.5
    assert item["quantity_unit"] == "minutes"
    assert item["billing_source"] == "virtual_runtime_credits"


def test_connector_read_usage_maps_to_read_line_item() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        metadata={"credit_item_type": "connector_read", "read_count": 3, "connector_kind": "google_sheets"},
        billing_source="empyralis_credits",
    )

    assert item["credit_item_type"] == "connector_read"
    assert item["quantity"] == 3.0
    assert item["quantity_unit"] == "reads"
    assert item["connector_kind"] == "google_sheets"


def test_unknown_hosted_tier_defaults_to_ai_pro_tokens() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        metadata={},
        total_tokens=321,
    )

    assert item["credit_item_type"] == "ai_pro_tokens"
    assert item["credit_multiplier"] == 1.0
    assert item["quantity"] == 321.0


def test_pro_line_item_preserves_internal_route_metadata() -> None:
    item = credit_ledger_contract.build_credit_ledger_line_item(
        metadata={
            "public_tier": "pro",
            "effective_provider": "deepseek",
            "effective_model": "deepseek-v4-pro",
            "fallback_provider": "deepseek",
            "fallback_model": "deepseek-v4-flash",
        },
        total_tokens=777,
    )

    assert item["public_tier"] == "pro"
    assert item["credit_item_type"] == "ai_pro_tokens"
    assert item["effective_provider"] == "deepseek"
    assert item["effective_model"] == "deepseek-v4-pro"
    assert item["fallback_provider"] == "deepseek"
    assert item["fallback_model"] == "deepseek-v4-flash"
