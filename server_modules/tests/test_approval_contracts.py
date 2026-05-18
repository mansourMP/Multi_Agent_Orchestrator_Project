from server_modules import approval_contracts


def test_runtime_approval_contract_has_web_resolution_paths():
    payload = approval_contracts.normalize_runtime_approval({
        "approval_id": "approval-1",
        "run_id": "run-1",
        "prompt": "Send the email?",
        "expires_at": "2026-05-19T12:00:00Z",
        "metadata": {"risk_level": "critical"},
    })

    assert payload["id"] == "approval-1"
    assert payload["code"] == "approval-1"
    assert payload["action"] == "Approval required"
    assert payload["risk"] == "critical"
    assert payload["channel"] == "web"
    assert payload["run_id"] == "run-1"
    assert payload["approve_path"] == "/api/runs/run-1/approvals/approval-1/resolve"
    assert payload["deny_path"] == "/api/runs/run-1/approvals/approval-1/resolve"


def test_gateway_channel_approval_contract_formats_reply_instruction():
    raw = {
        "approval_id": "approval-wa-1",
        "gateway_id": "gateway-1",
        "capability_id": "channel.whatsapp.personal.send",
        "run_id": "run-channel-1",
        "expires_at": "2026-05-19T12:00:00Z",
        "request_payload": {"risk": "critical"},
    }

    normalized = approval_contracts.normalize_gateway_approval(raw, channel="whatsapp_personal")
    instruction = approval_contracts.channel_approval_instruction(
        normalized,
        channel_key="whatsapp_personal",
    )

    assert normalized["id"] == "approval-wa-1"
    assert normalized["action"] == "channel.whatsapp.personal.send"
    assert normalized["risk"] == "critical"
    assert normalized["approve_path"] == "/api/gateway/registrations/gateway-1/approvals/approval-wa-1/resolve"
    assert instruction["approve_text"] == "approve approval-wa-1"
    assert instruction["deny_text"] == "deny approval-wa-1"
    assert "Reply approve approval-wa-1 or deny approval-wa-1" in instruction["instruction"]
    assert instruction["approval"]["code"] == "approval-wa-1"
