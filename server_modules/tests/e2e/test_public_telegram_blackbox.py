from __future__ import annotations

import time
from typing import Any, Dict, Tuple


def _wait_for_conversation_item(
    blackbox_runtime,
    *,
    owner: Dict[str, Any],
    deployed_agent_id: str,
    timeout_seconds: float = 15.0,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    deadline = time.time() + max(1.0, float(timeout_seconds))
    last_payload: Dict[str, Any] = {}
    while time.time() < deadline:
        last_payload = blackbox_runtime.list_conversations(
            owner=owner,
            deployed_agent_id=deployed_agent_id,
        )
        items = last_payload.get("items") or []
        if items:
            return last_payload, items[0]
        time.sleep(0.2)
    assert (last_payload.get("items") or []), last_payload
    items = last_payload.get("items") or []
    return last_payload, items[0]


def test_public_telegram_deployed_agent_blackbox_flow(blackbox_runtime) -> None:
    owner = blackbox_runtime.register_owner(email_prefix="telegram-public")
    live = blackbox_runtime.create_live_telegram_deployed_agent(owner=owner, name="Brakebox")
    deployed_agent = live["deployed_agent"]
    connector = live["connector"]

    response = blackbox_runtime.telegram_webhook(
        connector_id=connector["id"],
        text="Need brake pads",
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["action"] == "accepted"
    run_id = str(payload.get("run_id") or "").strip()
    assert run_id

    send_calls = blackbox_runtime.captured_telegram_calls(method_name="sendMessage")
    assert send_calls
    assert str(send_calls[-1]["payload"].get("text") or "").strip() == "Thinking..."

    terminal_run = blackbox_runtime.wait_for_run_terminal(run_id)
    assert str(terminal_run.get("status") or "").strip().lower() == "completed"
    blackbox_runtime.pump_outbox_until(
        lambda: len(blackbox_runtime.captured_telegram_calls(method_name="editMessageText")) >= 1,
    )

    final_text = blackbox_runtime.latest_telegram_text(method_name="editMessageText")
    assert "Blackbox durable reply:" in final_text
    assert "Need brake pads" in final_text
    assert "Execution Result" in final_text

    _, conversation = _wait_for_conversation_item(
        blackbox_runtime,
        owner=owner,
        deployed_agent_id=deployed_agent["id"],
    )
    assert conversation["channel"] == "telegram"
    assert conversation["latest_run_id"] == run_id

    detail = blackbox_runtime.get_conversation_detail(
        owner=owner,
        deployed_agent_id=deployed_agent["id"],
        session_id=conversation["session_id"],
    )
    texts = [str(item.get("text") or "") for item in (detail.get("messages") or [])]
    assert any("Need brake pads" in text for text in texts)
    assert detail["channel"] == "telegram"
    assert detail["run_ids"]


def test_public_daily_quota_cta_wins_first_visible_denial(blackbox_runtime) -> None:
    owner = blackbox_runtime.register_owner(email_prefix="telegram-quota")
    live = blackbox_runtime.create_live_telegram_deployed_agent(
        owner=owner,
        name="QuotaBot",
        config_overrides={
            "customer_policy": {
                "daily_message_limit": 1,
                "upgrade_cta_label": "Upgrade",
                "upgrade_cta_url": "https://blackbox.example/upgrade",
            },
        },
    )
    deployed_agent = live["deployed_agent"]
    connector = live["connector"]

    first = blackbox_runtime.telegram_webhook(
        connector_id=connector["id"],
        text="First question",
    )
    assert first.status_code == 200, first.text
    first_run_id = str(first.json().get("run_id") or "").strip()
    assert first_run_id
    blackbox_runtime.wait_for_run_terminal(first_run_id)
    blackbox_runtime.pump_outbox_until(
        lambda: len(blackbox_runtime.captured_telegram_calls(method_name="editMessageText")) >= 1,
    )

    _, conversation = _wait_for_conversation_item(
        blackbox_runtime,
        owner=owner,
        deployed_agent_id=deployed_agent["id"],
    )

    send_before = len(blackbox_runtime.captured_telegram_calls(method_name="sendMessage"))
    second = blackbox_runtime.telegram_webhook(
        connector_id=connector["id"],
        text="Second question should be capped",
    )
    assert second.status_code == 200, second.text
    second_payload = second.json()
    assert second_payload["action"] == "rate_limited"
    assert not second_payload.get("run_id")

    new_send_calls = blackbox_runtime.captured_telegram_calls(method_name="sendMessage")[send_before:]
    assert new_send_calls
    denial_text = str(new_send_calls[-1]["payload"].get("text") or "").strip()
    assert "has reached today's free message limit" in denial_text
    assert "Upgrade" in denial_text
    assert "https://blackbox.example/upgrade" in denial_text
    assert "still finishing the previous message" not in denial_text
    assert "helping other customers" not in denial_text
    assert "current service window" not in denial_text

    activity_rows = blackbox_runtime.list_activity_events(
        owner=owner,
        backing_install_id=deployed_agent["backing_install_id"],
        session_key=conversation["session_id"],
    )
    assert any(str(row.get("action") or "").strip() == "daily_message_limit_exceeded" for row in activity_rows), activity_rows
