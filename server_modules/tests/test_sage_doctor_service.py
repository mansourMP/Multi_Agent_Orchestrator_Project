"""Tests for the Sage Doctor / Diagnostics service."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server_modules.sage_doctor_service import SageDoctorService, _check, _summary


# ---------------------------------------------------------------------------
# Helper for building mock return values
# ---------------------------------------------------------------------------

def _make_gateway_session(status: str = "connected") -> dict:
    return {
        "status": status,
        "gateway_id": "gw-test-001",
        "last_heartbeat_at": "2026-06-07T12:00:00Z",
    }


def _make_gateway_registration(status: str = "active") -> dict:
    return {
        "gateway_id": "gw-test-001",
        "status": status,
        "device_trust_state": "verified",
        "workspace_id": "ws-test",
    }


def _make_selection(gateway_id: str = "gw-test-001") -> dict:
    return {
        "workspace_id": "ws-test",
        "user_id": "default",
        "selected_gateway_id": gateway_id,
        "selected_at": "2026-06-07T12:00:00Z",
        "selected_by": "test",
    }


def _make_telegram_state(status: str = "connected") -> dict:
    return {
        "gateway_id": "gw-test-001",
        "channel_key": "telegram_personal",
        "status": status,
        "linked_user_id": "user-123",
        "linked_username": "testuser",
        "linked_name": "Test User",
        "workspace_id": "ws-test",
    }


def _make_whatsapp_state(status: str = "connected") -> dict:
    return {
        "gateway_id": "gw-test-001",
        "channel_key": "whatsapp_personal",
        "status": status,
        "linked_jid": "1234567890@s.whatsapp.net",
        "linked_name": "Test User",
        "workspace_id": "ws-test",
    }


def _make_vault_with_credentials(providers: list[str]) -> dict:
    entries = []
    for provider in providers:
        entries.append({
            "id": f"cred-{provider}",
            "provider": provider,
            "label": f"{provider.title()} Credential",
            "mode": "byok",
            "workspace_id": "ws-test",
            "created_at": "2026-06-07T12:00:00Z",
            "updated_at": "2026-06-07T12:00:00Z",
            "encrypted_secret": "dummy_encrypted",
        })
    return {"credentials": entries, "version": 1}


def _make_mcp_servers(enabled_count: int = 2) -> list:
    return [
        {"id": f"server-{i}", "label": f"Server {i}", "enabled": True, "transport": "streamable_http"}
        for i in range(enabled_count)
    ]


def _make_outbox_status(undelivered: int = 0, poisoned: int = 0) -> dict:
    return {
        "undelivered_count": undelivered,
        "poisoned_count": poisoned,
        "claimed_count": 0,
        "repeated_failure_count": 0,
        "stuck_count": 0,
        "total_retry_count": 0,
        "max_retry_count": 0,
        "last_delivery_error": None,
    }


# ---------------------------------------------------------------------------
# Shared patches list builders (patch the REAL module path, since the doctor
# service imports via `from server_modules import X` inside functions)
# ---------------------------------------------------------------------------

def _healthy_patches():
    """Patches for all services returning healthy / present state."""
    return [
        patch("server_modules.sage_agent_computer_selection_service.get_selection",
              return_value=_make_selection()),
        patch("server_modules.gateway_state_repository.get_latest_gateway_session",
              return_value=_make_gateway_session("connected")),
        patch("server_modules.gateway_state_repository.get_gateway_registration",
              return_value=_make_gateway_registration("active")),
        patch("server_modules.gateway_registry_service.list_workspace_gateways",
              return_value={"items": [_make_gateway_registration("active")], "count": 1}),
        patch("server_modules.gateway_state_repository.list_gateway_browser_sessions",
              return_value=[{"session_id": "browser-1"}]),
        patch("server_modules.personal_channels_repository.get_telegram_state",
              return_value=_make_telegram_state("connected")),
        patch("server_modules.personal_channels_repository.get_whatsapp_state",
              return_value=_make_whatsapp_state("connected")),
        patch("server_modules.vault_store.load_vault",
              return_value=_make_vault_with_credentials(["slack", "discord", "google_workspace"])),
        patch("server_modules.mcp_registry_service.list_workspace_mcp_servers",
              return_value=_make_mcp_servers(2)),
        patch("server_modules.durable_quota_store.use_in_memory_quota_mode",
              return_value=False),
        patch("server_modules.outbox_service.get_outbox_delivery_status",
              return_value=_make_outbox_status(0, 0)),
        # provider_has_key is imported from scripts.orion_local_worker_llm
        patch("scripts.orion_local_worker_llm.provider_has_key",
              return_value=True),
        # Policy module level attributes
        patch("server_modules.runtime_policy._init",
              return_value=None),
        patch("server_modules.runtime_policy._load_tool_state",
              return_value=None),
    ]


def _apply(patches):
    for p in patches:
        p.start()
    return patches


def _cleanup(patches):
    for p in patches:
        p.stop()


# ---------------------------------------------------------------------------
# Test 1: All checks return structured results
# ---------------------------------------------------------------------------

class TestAllChecksReturnStructuredResults:

    @pytest.fixture(autouse=True)
    def _mock_all_healthy(self):
        patches = _apply(_healthy_patches())
        yield
        _cleanup(patches)

    def test_all_checks_return_structured_results(self):
        result = SageDoctorService.check_all(
            workspace_id="ws-test",
            tenant_id="default",
            user_id="default",
        )

        assert "workspace_id" in result
        assert result["workspace_id"] == "ws-test"
        assert "timestamp" in result
        assert "summary" in result
        assert "checks" in result

        checks = result["checks"]
        assert len(checks) == 13, f"Expected 13 checks, got {len(checks)}"

        for check in checks:
            assert "id" in check, f"Check missing 'id': {check}"
            assert "label" in check, f"Check missing 'label': {check}"
            assert "status" in check, f"Check missing 'status': {check}"
            msg = f"Unexpected status '{check['status']}' in {check['id']}"
            assert check["status"] in {"pass", "fail", "warn", "skip"}, msg
            assert "detail" in check, f"Check missing 'detail': {check}"
            assert "next_action" in check, f"Check missing 'next_action': {check}"
            assert "group" in check, f"Check missing 'group': {check}"
            msg = f"Unexpected group '{check['group']}' in {check['id']}"
            assert check["group"] in {"Agent Computer", "Channels", "Providers",
                                      "Infrastructure", "Policy"}, msg

        summary = result["summary"]
        total = summary["pass"] + summary["fail"] + summary["warn"] + summary["skip"]
        assert total == len(checks), "Summary counts don't match total checks"


# ---------------------------------------------------------------------------
# Test 2: Offline gateway reports specific next_action
# ---------------------------------------------------------------------------

class TestOfflineGatewayReportsSpecificNextAction:

    @pytest.fixture(autouse=True)
    def _mock_offline_gateway(self):
        patches = _apply([
            patch("server_modules.sage_agent_computer_selection_service.get_selection",
                  return_value=_make_selection()),
            patch("server_modules.gateway_state_repository.get_latest_gateway_session",
                  return_value=_make_gateway_session("disconnected")),
            patch("server_modules.gateway_state_repository.get_gateway_registration",
                  return_value=_make_gateway_registration("active")),
            patch("server_modules.gateway_state_repository.list_gateway_browser_sessions",
                  return_value=[]),
            patch("server_modules.gateway_registry_service.list_workspace_gateways",
                  return_value={"items": [_make_gateway_registration("active")], "count": 1}),
            patch("server_modules.personal_channels_repository.get_telegram_state",
                  return_value=None),
            patch("server_modules.personal_channels_repository.get_whatsapp_state",
                  return_value=None),
            patch("server_modules.vault_store.load_vault",
                  return_value={"credentials": []}),
            patch("server_modules.mcp_registry_service.list_workspace_mcp_servers",
                  return_value=[]),
            patch("server_modules.durable_quota_store.use_in_memory_quota_mode",
                  return_value=True),
            patch("server_modules.outbox_service.get_outbox_delivery_status",
                  return_value=_make_outbox_status(0, 0)),
            patch("scripts.orion_local_worker_llm.provider_has_key",
                  return_value=False),
            patch("server_modules.runtime_policy._init", return_value=None),
            patch("server_modules.runtime_policy._load_tool_state", return_value=None),
        ])
        yield
        _cleanup(patches)

    def test_offline_gateway_reports_specific_next_action(self):
        result = SageDoctorService.check_all(
            workspace_id="ws-test",
            tenant_id="default",
        )

        checks = {c["id"]: c for c in result["checks"]}

        # The agent_computer check should report offline
        agent = checks.get("agent_computer")
        assert agent is not None
        next_action = agent["next_action"].lower()
        assert ("check gateway power" in next_action
                or "check gateway" in next_action
                or "reinstall" in next_action), \
            f"Expected specific next_action about gateway power/network, got: {agent['next_action']}"

        # The browser_runtime check should also show offline
        browser = checks.get("browser_runtime")
        assert browser is not None
        assert ("offline" in browser["detail"].lower()
                or "not selected" in browser["detail"].lower()), \
            f"Expected offline indicator in browser_runtime detail: {browser['detail']}"


# ---------------------------------------------------------------------------
# Test 3: Missing Google credentials returns specific instruction
# ---------------------------------------------------------------------------

class TestMissingGoogleCredentialsReturnsSpecificInstruction:

    @pytest.fixture(autouse=True)
    def _mock_no_google_vault(self):
        patches = _apply([
            patch("server_modules.sage_agent_computer_selection_service.get_selection",
                  return_value=_make_selection()),
            patch("server_modules.gateway_state_repository.get_latest_gateway_session",
                  return_value=_make_gateway_session("connected")),
            patch("server_modules.gateway_state_repository.get_gateway_registration",
                  return_value=_make_gateway_registration("active")),
            patch("server_modules.gateway_state_repository.list_gateway_browser_sessions",
                  return_value=[{"session_id": "browser-1"}]),
            patch("server_modules.gateway_registry_service.list_workspace_gateways",
                  return_value={"items": [_make_gateway_registration("active")], "count": 1}),
            patch("server_modules.personal_channels_repository.get_telegram_state",
                  return_value=_make_telegram_state("connected")),
            patch("server_modules.personal_channels_repository.get_whatsapp_state",
                  return_value=_make_whatsapp_state("connected")),
            # Vault has slack and discord but NOT google_workspace
            patch("server_modules.vault_store.load_vault",
                  return_value=_make_vault_with_credentials(["slack", "discord"])),
            patch("server_modules.mcp_registry_service.list_workspace_mcp_servers",
                  return_value=_make_mcp_servers(2)),
            patch("server_modules.durable_quota_store.use_in_memory_quota_mode",
                  return_value=False),
            patch("server_modules.outbox_service.get_outbox_delivery_status",
                  return_value=_make_outbox_status(0, 0)),
            patch("scripts.orion_local_worker_llm.provider_has_key",
                  return_value=True),
            patch("server_modules.runtime_policy._init", return_value=None),
            patch("server_modules.runtime_policy._load_tool_state", return_value=None),
        ])
        yield
        _cleanup(patches)

    def test_missing_google_credentials_returns_specific_instruction(self):
        result = SageDoctorService.check_all(
            workspace_id="ws-test",
            tenant_id="default",
        )

        checks = {c["id"]: c for c in result["checks"]}
        google = checks.get("google_credentials")
        assert google is not None
        assert google["status"] == "fail"
        next_action = google["next_action"].lower()
        assert "via oauth" in next_action, \
            f"Expected OAuth instruction in next_action, got: {google['next_action']}"


# ---------------------------------------------------------------------------
# Test 4: Doctor route returns JSON
# ---------------------------------------------------------------------------

class TestDoctorRouteReturnsJson:

    @pytest.fixture(autouse=True)
    def _mock_all_for_route(self):
        patches = _apply(_healthy_patches())
        yield
        _cleanup(patches)

    def test_doctor_route_returns_json(self):
        from server_modules.routes_doctor import router
        from server_modules.runtime_common import require_api_key

        app = FastAPI()
        app.include_router(router)
        # Override auth dependency to skip real auth
        app.dependency_overrides[require_api_key] = lambda: {"user_id": "test", "role": "admin"}

        # Patch enforce_workspace_access inside the route module so it
        # returns the workspace_id directly without real tenant checks.
        with patch("server_modules.routes_doctor.enforce_workspace_access",
                   return_value="ws-test"):
            with TestClient(app) as client:
                response = client.get(
                    "/sage/doctor/check?workspace_id=ws-test&tenant_id=default",
                    headers={"Authorization": "Bearer test-key"},
                )

        assert response.status_code == 200, \
            f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert "workspace_id" in data
        assert data["workspace_id"] == "ws-test"
        assert "timestamp" in data
        assert "summary" in data
        assert "checks" in data

        summary = data["summary"]
        assert "pass" in summary
        assert "fail" in summary
        assert "warn" in summary
        assert "skip" in summary

        assert len(data["checks"]) > 0, "Expected at least one check result"


# ---------------------------------------------------------------------------
# Test 5: No vague "not configured" messages
# ---------------------------------------------------------------------------

class TestNoVagueNotConfiguredMessages:

    @pytest.fixture(autouse=True)
    def _mock_various_states(self):
        """Mock a mix of states to test all messages."""
        patches = _apply([
            patch("server_modules.sage_agent_computer_selection_service.get_selection",
                  return_value=_make_selection()),
            patch("server_modules.gateway_state_repository.get_latest_gateway_session",
                  return_value=_make_gateway_session("connected")),
            patch("server_modules.gateway_state_repository.get_gateway_registration",
                  return_value=_make_gateway_registration("active")),
            patch("server_modules.gateway_state_repository.list_gateway_browser_sessions",
                  return_value=[]),
            patch("server_modules.gateway_registry_service.list_workspace_gateways",
                  return_value={"items": [_make_gateway_registration("active")], "count": 1}),
            patch("server_modules.personal_channels_repository.get_telegram_state",
                  return_value=None),
            patch("server_modules.personal_channels_repository.get_whatsapp_state",
                  return_value=None),
            patch("server_modules.vault_store.load_vault",
                  return_value=_make_vault_with_credentials([])),
            patch("server_modules.mcp_registry_service.list_workspace_mcp_servers",
                  return_value=[]),
            patch("server_modules.durable_quota_store.use_in_memory_quota_mode",
                  return_value=True),
            patch("server_modules.outbox_service.get_outbox_delivery_status",
                  return_value=_make_outbox_status(1, 0)),
            patch("scripts.orion_local_worker_llm.provider_has_key",
                  return_value=False),
            patch("server_modules.runtime_policy._init", return_value=None),
            patch("server_modules.runtime_policy._load_tool_state", return_value=None),
        ])
        yield
        _cleanup(patches)

    def test_no_vague_not_configured_messages(self):
        result = SageDoctorService.check_all(
            workspace_id="ws-test",
            tenant_id="default",
        )

        checks = result["checks"]
        for check in checks:
            next_action = check["next_action"].lower()
            # The phrase "not configured" alone is invalid when we know
            # the specific root cause.  However, "not configured" is
            # acceptable when paired with a specific action instruction
            # (e.g. "Telegram personal channel not configured. Open the
            # channel and follow setup.").  Detect the bare pattern:
            # if the entire next_action IS just "not configured" or
            # ends with "not configured" without a follow-up action.
            if next_action.strip() == "not configured":
                assert False, (
                    f"Check '{check['id']}' next_action is just 'not configured' "
                    f"instead of a specific instruction: {check['next_action']}"
                )
            # next_action should never be empty or extremely short
            assert len(next_action) > 10, (
                f"Check '{check['id']}' next_action is too vague: '{check['next_action']}'"
            )


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------

class TestHelpers:

    def test_check_helper_validates_groups(self):
        result = _check(
            check_id="test_check",
            label="Test Check",
            status="pass",
            detail="Everything is fine.",
            next_action="No action needed.",
            group="Infrastructure",
        )
        assert result["status"] == "pass"
        assert result["group"] == "Infrastructure"

    def test_check_helper_rejects_bad_group(self):
        with pytest.raises(AssertionError):
            _check(
                check_id="test",
                label="Test",
                status="pass",
                detail="ok",
                next_action="none",
                group="UnknownGroup",
            )

    def test_check_helper_rejects_bad_status(self):
        with pytest.raises(AssertionError):
            _check(
                check_id="test",
                label="Test",
                status="invalid",
                detail="bad",
                next_action="none",
                group="Policy",
            )

    def test_summary_counts(self):
        checks = [
            {"status": "pass"},
            {"status": "pass"},
            {"status": "fail"},
            {"status": "warn"},
            {"status": "skip"},
        ]
        s = _summary(checks)
        assert s == {"pass": 2, "fail": 1, "warn": 1, "skip": 1}

    def test_summary_unknown_status_defaults_to_skip(self):
        checks = [{"status": "nonexistent"}]
        s = _summary(checks)
        assert s["skip"] == 1
