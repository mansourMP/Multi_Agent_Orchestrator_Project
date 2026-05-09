from __future__ import annotations

import logging
from typing import Any, Dict

import pytest

from server_modules import channel_execution_service
from server_modules import deployed_agent_service
from server_modules.channel_routing_models import ChannelRoutingContext
from server_modules.channel_turn_request_service import build_routing_context


class _QuotaSnapshot:
    max_runtime_seconds = 30


class _QuotaSlot:
    async def __aenter__(self) -> Dict[str, Any]:
        return {"quota_snapshot": _QuotaSnapshot()}

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


def _context(
    *,
    deployed_agent: Dict[str, Any] | None = None,
    connector_id: str | None = "gsheet-products-1",
) -> ChannelRoutingContext:
    return ChannelRoutingContext(
        tenant_id="tenant-1",
        workspace_id="ws-1",
        channel_key="telegram",
        endpoint_key="@shop_bot",
        actor_id="customer-1",
        actor_display_name="Customer",
        session_key="session-1",
        thread_id="thread-1",
        message="Do you have Nike Air Max 90?",
        owner_type="specialist",
        install={"id": "install-1", "owner_user_id": "owner-1"},
        manifest=None,
        responder_install_id="install-1",
        responder_label="Shop Assistant",
        runtime_mode="hosted_secure",
        runtime_profile_id=None,
        master_install_id="install-1",
        shared_metadata={"request_id": "req-1"},
        turn_request={"message": "Do you have Nike Air Max 90?"},
        execution_owner={"user_id": "owner-1", "role": "owner", "is_admin": True},
        connector_id=connector_id,
        deployed_agent=deployed_agent,
        deployed_agent_id="dagent-shop" if deployed_agent else None,
        deployed_agent_state="live" if deployed_agent else None,
    )


async def _wait_for(coro, *, timeout: int):
    return await coro


async def _generic_turn(**kwargs):
    return {"status": "completed", "reply": "generic response"}


@pytest.mark.anyio
async def test_shop_assistant_channel_turn_uses_revenue_evaluator_with_connector(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        channel_execution_service.channel_execution_quota_adapter,
        "channel_execution_slot",
        lambda **kwargs: _QuotaSlot(),
    )

    calls: list[Dict[str, Any]] = []

    async def fake_evaluate(**kwargs):
        calls.append(dict(kwargs))
        return {
            "status": "answered",
            "intent": "catalog_lookup",
            "answer": "Nike Air Max 90 is 8 in stock.",
            "approval": {"required": False},
            "activity_events": [{"event": "studio.proof.shop_assistant.inventory_hit"}],
        }

    monkeypatch.setattr(
        deployed_agent_service,
        "evaluate_deployed_shop_assistant_customer_question",
        fake_evaluate,
    )

    result = await channel_execution_service.execute_prepared_channel_turn(
        context=_context(deployed_agent={"template_slug": "shop-assistant"}),
        execute_turn=_generic_turn,
        wait_for=_wait_for,
    )

    assert result.status == "answered"
    assert result.reply == "Nike Air Max 90 is 8 in stock."
    assert result.metadata["response_class"] == "shop_assistant"
    assert result.payload["intent"] == "catalog_lookup"
    assert calls == [
        {
            "deployed_agent_id": "dagent-shop",
            "current_user": {"user_id": "owner-1", "role": "owner", "is_admin": True},
            "owner_workspace_id": "ws-1",
            "customer_message": "Do you have Nike Air Max 90?",
            "connector_id": "gsheet-products-1",
        }
    ]


@pytest.mark.anyio
async def test_non_shop_channel_turn_uses_generic_runtime(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        channel_execution_service.channel_execution_quota_adapter,
        "channel_execution_slot",
        lambda **kwargs: _QuotaSlot(),
    )

    async def fail_if_called(**kwargs):
        raise AssertionError("shop evaluator should not run for non-shop agents")

    monkeypatch.setattr(
        deployed_agent_service,
        "evaluate_deployed_shop_assistant_customer_question",
        fail_if_called,
    )

    result = await channel_execution_service.execute_prepared_channel_turn(
        context=_context(deployed_agent={"template_slug": "support-faq"}),
        execute_turn=_generic_turn,
        wait_for=_wait_for,
    )

    assert result.status == "completed"
    assert result.reply == "generic response"


@pytest.mark.anyio
async def test_shop_evaluator_failure_logs_and_falls_back_to_generic(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    monkeypatch.setattr(
        channel_execution_service.channel_execution_quota_adapter,
        "channel_execution_slot",
        lambda **kwargs: _QuotaSlot(),
    )

    async def fake_evaluate(**kwargs):
        raise RuntimeError("catalog unavailable")

    monkeypatch.setattr(
        deployed_agent_service,
        "evaluate_deployed_shop_assistant_customer_question",
        fake_evaluate,
    )

    with caplog.at_level(logging.ERROR):
        result = await channel_execution_service.execute_prepared_channel_turn(
            context=_context(deployed_agent={"template_slug": "shop-assistant"}),
            execute_turn=_generic_turn,
            wait_for=_wait_for,
        )

    assert result.status == "completed"
    assert result.reply == "generic response"
    assert "Shop assistant channel evaluation failed" in caplog.text


def test_build_routing_context_extracts_connector_id_from_metadata() -> None:
    context = build_routing_context(
        tenant_id="tenant-1",
        workspace_id="ws-1",
        channel_key="telegram",
        endpoint_key="@shop_bot",
        customer_message="Do you have Nike Air Max 90?",
        install={"id": "install-1", "owner_user_id": "owner-1"},
        metadata={"connector_id": "gsheet-products-1"},
        validate_preflight=False,
    )

    assert context.connector_id == "gsheet-products-1"
