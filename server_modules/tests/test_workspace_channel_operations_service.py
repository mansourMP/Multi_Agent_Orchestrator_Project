from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi import HTTPException

from server_modules import workspace_channel_operations_service


def _workspace_access_entry(*, workspace_id: str, tenant_id: str, role: str) -> Dict[str, Any]:
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "tenant_role": role,
        "role": role,
        "capabilities": {"allow": [], "deny": []},
        "tenant_capabilities": {"allow": [], "deny": []},
        "workspace_capabilities": {"allow": [], "deny": []},
        "dangerous_action_classes": {"allow": [], "deny": []},
        "tenant_dangerous_action_classes": {"allow": [], "deny": []},
        "workspace_dangerous_action_classes": {"allow": [], "deny": []},
        "connectors": {"allow": [], "deny": []},
        "tenant_connectors": {"allow": [], "deny": []},
        "workspace_connectors": {"allow": [], "deny": []},
        "machine_enrollment_scope": "workspace",
        "trusted_owner_machine_ids": [],
        "owner_user_id": "user-1",
        "owner_email": "user@example.com",
    }


def _current_user(*, role: str = "admin") -> Dict[str, Any]:
    return {
        "auth_type": "bearer",
        "user_id": "user-1",
        "email": "user@example.com",
        "role": role,
        "is_admin": role == "owner",
        "identity_versions": {"membership_version": 8},
        "workspace_access": {
            "ws-1": _workspace_access_entry(workspace_id="ws-1", tenant_id="tenant-1", role=role),
        },
    }


@pytest.mark.anyio
async def test_build_workspace_channel_operations_filters_runtime_state_by_workspace(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    async def fake_telegram_status():
        return {
            "status": "live",
            "issues": [{"code": "telegram_webhook_ready", "severity": "degraded", "message": "telegram note"}],
            "webhook": {"status": "live", "public_url_template": "https://runtime.example/channels/telegram/webhook/{connector_id}"},
            "autopilot": {"status": "live"},
            "connectors": [
                {
                    "id": "tg-ws-1",
                    "label": "Telegram One",
                    "workspace_id": "ws-1",
                    "profile_status": "live",
                    "last_error": None,
                },
                {
                    "id": "tg-ws-2",
                    "label": "Telegram Two",
                    "workspace_id": "ws-2",
                    "profile_status": "live",
                    "last_error": "wrong workspace",
                },
            ],
        }

    async def fake_whatsapp_status():
        return {
            "status": "degraded",
            "issues": [],
            "webhook": {"status": "setup_needed", "public_url": "https://runtime.example/channels/whatsapp/twilio/webhook"},
            "autopilot": {"status": "degraded"},
            "connectors": [
                {
                    "id": "wa-ws-1",
                    "label": "WhatsApp One",
                    "workspace_id": "ws-1",
                    "profile_status": "setup_needed",
                    "profile_issue_code": "wa_profile_missing",
                    "profile_issue": "Profile incomplete",
                    "last_error": "delivery issue",
                    "last_error_category": "transport_error",
                    "last_error_at": "2026-04-12T08:00:00Z",
                }
            ],
        }

    async def fake_delivery_status():
        return {
            "undelivered_count": 3,
            "poisoned_count": 1,
            "total_retry_count": 4,
            "max_retry_count": 2,
            "last_delivery_error": {
                "event_id": "evt-global",
                "message": "global failure",
                "last_attempted_at": "2026-04-12T07:00:00Z",
                "retry_count": 2,
            },
        }

    async def fake_undelivered_outbox_events(*, older_than_seconds: int = 0, limit: int = 200):
        assert older_than_seconds == 0
        assert limit == 200
        return [
            {
                "event_id": "evt-1",
                "event_type": "channel_run_delivery",
                "workspace_id": "ws-1",
                "retry_count": 2,
                "last_delivery_error": "telegram send failed",
                "last_attempted_at": "2026-04-12T09:00:00Z",
                "payload": {"channel": "telegram", "session_key": "chat-1"},
            },
            {
                "event_id": "evt-2",
                "event_type": "channel_run_delivery",
                "workspace_id": "ws-2",
                "retry_count": 1,
                "last_delivery_error": "wrong workspace",
                "last_attempted_at": "2026-04-12T09:01:00Z",
                "payload": {"channel": "whatsapp", "session_key": "chat-2"},
            },
            {
                "event_id": "evt-3",
                "event_type": "runtime_event",
                "workspace_id": "ws-1",
                "retry_count": 0,
                "last_delivery_error": None,
                "last_attempted_at": None,
                "payload": {"channel": "telegram"},
            },
        ]

    async def fake_poisoned_outbox_events(*, limit: int = 200):
        assert limit == 200
        return [
            {
                "event_id": "evt-poison",
                "event_type": "channel_run_delivery",
                "workspace_id": "ws-1",
                "retry_count": 5,
                "last_delivery_error": "telegram poisoned",
                "last_attempted_at": "2026-04-12T08:40:00Z",
                "poisoned_at": "2026-04-12T08:41:00Z",
                "payload": {
                    "channel": "telegram",
                    "session_key": "chat-9",
                    "delivery": {"receipt": {"provider_message_id": "msg-9"}},
                },
            }
        ]

    dead_letter_file = tmp_path / "dead_letters.json"
    dead_letter_file.write_text(
        json.dumps(
            {
                "version": 1,
                "items": [
                    {
                        "id": "dead-1",
                        "workspace_id": "ws-1",
                        "channel": "telegram",
                        "reason": "delivery_failed",
                        "action": "deliver_final_response",
                    },
                    {
                        "id": "dead-2",
                        "workspace_id": "ws-2",
                        "channel": "whatsapp",
                        "reason": "wrong_workspace",
                        "action": "deliver_final_response",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        workspace_channel_operations_service,
        "handle_telegram_autopilot_status",
        fake_telegram_status,
    )
    monkeypatch.setattr(
        workspace_channel_operations_service,
        "handle_whatsapp_autopilot_status",
        fake_whatsapp_status,
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.run_state_repository,
        "get_outbox_delivery_status",
        fake_delivery_status,
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.run_state_repository,
        "list_undelivered_outbox_events",
        fake_undelivered_outbox_events,
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.run_state_repository,
        "list_poisoned_outbox_events",
        fake_poisoned_outbox_events,
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.shared_module,
        "CHANNEL_EVENTS_LOCK",
        threading.Lock(),
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.shared_module,
        "CHANNEL_EVENTS",
        [
            {
                "id": "ev-1",
                "workspace_id": "ws-1",
                "channel": "telegram",
                "direction": "inbound",
                "action": "pairing_required",
                "text": "link your account",
            },
            {
                "id": "ev-2",
                "workspace_id": "ws-1",
                "channel": "whatsapp",
                "direction": "outbound",
                "action": "deliver_final_response",
                "text": "done",
            },
            {
                "id": "ev-3",
                "workspace_id": "ws-2",
                "channel": "telegram",
                "direction": "inbound",
                "action": "pairing_failed",
                "text": "wrong workspace",
            },
        ],
    )
    monkeypatch.setattr(
        workspace_channel_operations_service.runtime_config,
        "ORION_CHANNEL_DEAD_LETTER_FILE",
        dead_letter_file,
    )

    payload = await workspace_channel_operations_service.build_workspace_channel_operations(
        current_user=_current_user(role="admin"),
        workspace_id="ws-1",
    )

    assert payload["workspace_id"] == "ws-1"
    assert payload["channels"]["telegram"]["workspace_configured"] is True
    assert [item["id"] for item in payload["channels"]["telegram"]["connectors"]] == ["tg-ws-1"]
    assert payload["channels"]["whatsapp"]["workspace_status"] == "setup_needed"
    assert payload["delivery"]["workspace_summary"]["pending_count"] == 1
    assert payload["delivery"]["workspace_summary"]["poisoned_count"] == 1
    assert payload["delivery"]["workspace_summary"]["pending_by_channel"] == {"telegram": 1}
    assert payload["delivery"]["workspace_summary"]["poisoned_by_channel"] == {"telegram": 1}
    assert payload["delivery"]["workspace_summary"]["repeated_failure_count"] == 1
    assert payload["delivery"]["workspace_summary"]["with_receipt_count"] == 1
    assert payload["delivery"]["pending"][0]["event_id"] == "evt-1"
    assert payload["delivery"]["poisoned"][0]["event_id"] == "evt-poison"
    assert payload["delivery"]["dead_letters"][0]["id"] == "dead-1"
    assert [item["id"] for item in payload["events"]["recent"]] == ["ev-1", "ev-2"]
    assert [item["id"] for item in payload["events"]["pairing_failures"]] == ["ev-1"]


@pytest.mark.anyio
async def test_build_workspace_channel_operations_requires_admin_workspace_access():
    with pytest.raises(HTTPException) as exc_info:
        await workspace_channel_operations_service.build_workspace_channel_operations(
            current_user=_current_user(role="member"),
            workspace_id="ws-1",
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin or owner role required for workspace 'ws-1'."
