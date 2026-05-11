from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from server_modules import gateway_approval_service, gateway_state_repository


def _fake_registration(gateway_id: str = "gw-1") -> dict:
    return {
        "gateway_id": gateway_id,
        "device_id": "dev-1",
        "tenant_id": "tenant-1",
        "workspace_id": "ws-1",
        "user_id": "user-1",
    }


def _make_approval(
    approval_id: str = "gapproval_test",
    status: str = "pending",
    requested_at: str | None = None,
) -> dict:
    if requested_at is None:
        requested_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "approval_id": approval_id,
        "gateway_id": "gw-1",
        "device_id": "dev-1",
        "tenant_id": "tenant-1",
        "workspace_id": "ws-1",
        "user_id": "user-1",
        "capability_id": "computer_control.click",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "status": status,
        "decision": None,
        "decision_actor": None,
        "decision_note": None,
        "requested_at": requested_at,
        "resolved_at": None,
        "executed_at": None,
        "retry_count": 0,
        "last_error": None,
        "request_payload": {
            "capability_id": "computer_control.click",
            "arguments": {},
            "run_id": "run-1",
            "trace_id": "trace-1",
        },
        "result_payload": {},
    }


# ---------------------------------------------------------------------------
# Repository-level atomic resolution tests (real SQLite via tmp_path)
# ---------------------------------------------------------------------------


class TestAtomicResolutionInRepository:
    """Tests for resolve_gateway_action_approval_atomic using an actual SQLite DB."""

    def _create_pending_approval(self, db_path: Path) -> dict:
        return gateway_state_repository.create_gateway_action_approval(
            gateway_id="gw-1",
            device_id="dev-1",
            tenant_id="tenant-1",
            workspace_id="ws-1",
            user_id="user-1",
            capability_id="test.capability",
            run_id="run-1",
            request_payload={},
            db_path=db_path,
        )

    def test_resolve_approve_succeeds_when_pending(self, tmp_path: Path) -> None:
        db_path = tmp_path / "gateway-state.sqlite3"
        approval = self._create_pending_approval(db_path)
        aid = approval["approval_id"]

        result = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1", decision="approved",
            actor="user1", note="looks good", db_path=db_path,
        )
        assert result is not None
        assert result["status"] == "approved"
        assert result["decision"] == "approved"
        assert result["decision_actor"] == "user1"
        assert result["decision_note"] == "looks good"

    def test_resolve_reject_succeeds_when_pending(self, tmp_path: Path) -> None:
        db_path = tmp_path / "gateway-state.sqlite3"
        approval = self._create_pending_approval(db_path)
        aid = approval["approval_id"]

        result = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1", decision="rejected",
            actor="user2", note="denied", db_path=db_path,
        )
        assert result is not None
        assert result["status"] == "rejected"
        assert result["decision"] == "rejected"
        assert result["decision_note"] == "denied"

    def test_second_resolve_returns_none(self, tmp_path: Path) -> None:
        """First writer wins; second atomic resolve returns None."""
        db_path = tmp_path / "gateway-state.sqlite3"
        approval = self._create_pending_approval(db_path)
        aid = approval["approval_id"]

        # First call wins
        first = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="approved", actor="user1", db_path=db_path,
        )
        assert first is not None
        assert first["status"] == "approved"

        # Second call loses — already resolved
        second = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="rejected", actor="user2", db_path=db_path,
        )
        assert second is None

        # Verify first decision is immutable
        final = gateway_state_repository.get_gateway_action_approval(aid, db_path=db_path)
        assert final is not None
        assert final["status"] == "approved"
        assert final["decision_actor"] == "user1"

    def test_approve_then_reject_approve_wins(self, tmp_path: Path) -> None:
        """Approve first, reject second — first (approve) wins."""
        db_path = tmp_path / "gateway-state.sqlite3"
        approval = self._create_pending_approval(db_path)
        aid = approval["approval_id"]

        winner = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="approved", actor="approver", db_path=db_path,
        )
        assert winner is not None
        assert winner["status"] == "approved"

        loser = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="rejected", actor="rejector", db_path=db_path,
        )
        assert loser is None

        final = gateway_state_repository.get_gateway_action_approval(aid, db_path=db_path)
        assert final["status"] == "approved"

    def test_reject_then_approve_reject_wins(self, tmp_path: Path) -> None:
        """Reject first, approve second — first (reject) wins."""
        db_path = tmp_path / "gateway-state.sqlite3"
        approval = self._create_pending_approval(db_path)
        aid = approval["approval_id"]

        winner = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="rejected", actor="rejector", db_path=db_path,
        )
        assert winner is not None
        assert winner["status"] == "rejected"

        loser = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=aid, gateway_id="gw-1",
            decision="approved", actor="approver", db_path=db_path,
        )
        assert loser is None

        final = gateway_state_repository.get_gateway_action_approval(aid, db_path=db_path)
        assert final["status"] == "rejected"


# ---------------------------------------------------------------------------
# Service-level tests (mocked repository)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGatewayApprovalServiceAtomic:
    """Tests for resolve_gateway_tool_approval in the service layer."""

    # -- Normal flows -------------------------------------------------------

    async def test_normal_approve_executes_tool(self) -> None:
        approval = _make_approval(status="pending")
        resolved = dict(
            approval,
            status="approved", decision="approved",
            decision_actor="user", resolved_at="now",
        )
        registration = _fake_registration()
        execute_mock = AsyncMock(return_value={"ok": True, "result": "done"})

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=resolved),
            patch("server_modules.gateway_approval_service.gateway_state_repository.record_gateway_event"),
            patch("server_modules.gateway_approval_service.gateway_activity_service.emit_gateway_approval_resolved", AsyncMock()),
            patch("server_modules.gateway_approval_service.gateway_state_repository.mark_gateway_action_approval_executed", return_value={**resolved, "status": "executed"}),
            patch("server_modules.gateway_approval_service.gateway_activity_service.append_gateway_activity", AsyncMock()),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
                execute_fn=execute_mock,
            )

        assert result["status"] == "executed"
        execute_mock.assert_awaited_once()

    async def test_normal_reject_returns_rejected(self) -> None:
        approval = _make_approval(status="pending")
        resolved = dict(
            approval,
            status="rejected", decision="rejected",
            decision_actor="user", resolved_at="now",
        )
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=resolved),
            patch("server_modules.gateway_approval_service.gateway_state_repository.record_gateway_event"),
            patch("server_modules.gateway_approval_service.gateway_activity_service.emit_gateway_approval_resolved", AsyncMock()),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="rejected",
                actor="user",
            )

        assert result["status"] == "rejected"

    # -- Immutability -------------------------------------------------------

    async def test_already_executed_immutable(self) -> None:
        approval = _make_approval(status="executed")
        approval["result_payload"] = {"result": "done"}
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
            )

        assert result["status"] == "executed"
        assert result["execution"] == {"result": "done"}

    async def test_already_rejected_immutable(self) -> None:
        approval = _make_approval(status="rejected")
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
            )

        assert result["status"] == "rejected"

    async def test_already_approved_immutable(self) -> None:
        approval = _make_approval(status="approved")
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
            )

        assert result["status"] == "approved"

    # -- Race: second caller finds already resolved -------------------------

    async def test_second_resolve_returns_current_status(self) -> None:
        """If atomic resolve returns None, re-read and return current status."""
        approval = _make_approval(status="pending")
        already_approved = dict(
            approval,
            status="approved", decision="approved",
            decision_actor="user1", resolved_at="now",
        )
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", side_effect=[
                approval,          # first read in resolve_gateway_tool_approval
                already_approved,  # re-read after losing atomic race
            ]),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=None),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user2",
            )

        assert result["status"] == "approved"

    async def test_second_resolve_finds_executed(self) -> None:
        """If another caller already approved and executed, return executed."""
        approval = _make_approval(status="pending")
        already_executed = dict(approval, status="executed", result_payload={"result": "done"})
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", side_effect=[
                approval,           # first read
                already_executed,   # re-read after losing atomic race
            ]),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=None),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user2",
            )

        assert result["status"] == "executed"

    # -- TTL expiry ---------------------------------------------------------

    async def test_expired_approval_returns_expired(self) -> None:
        old_time = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat().replace("+00:00", "Z")
        approval = _make_approval(status="pending", requested_at=old_time)
        expired_resolved = dict(
            approval,
            status="rejected", decision="rejected",
            decision_actor="system", resolved_at="now",
        )
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=expired_resolved),
            patch("server_modules.gateway_approval_service.gateway_state_repository.record_gateway_event"),
            patch("server_modules.gateway_approval_service.gateway_activity_service.emit_gateway_approval_resolved", AsyncMock()),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
                approval_ttl_seconds=900,
            )

        assert result["status"] == "expired"

    async def test_expired_approval_with_same_actor_returns_expired(self) -> None:
        """Even if the caller tries to reject, TTL takes priority."""
        old_time = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat().replace("+00:00", "Z")
        approval = _make_approval(status="pending", requested_at=old_time)
        expired_resolved = dict(
            approval,
            status="rejected", decision="rejected",
            decision_actor="system", resolved_at="now",
        )
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=expired_resolved),
            patch("server_modules.gateway_approval_service.gateway_state_repository.record_gateway_event"),
            patch("server_modules.gateway_approval_service.gateway_activity_service.emit_gateway_approval_resolved", AsyncMock()),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="rejected",
                actor="user",
                approval_ttl_seconds=900,
            )

        assert result["status"] == "expired"

    async def test_expired_approval_atomic_race_still_expired(self) -> None:
        """If TTL check wins but atomic resolve loses race, still return expired."""
        old_time = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat().replace("+00:00", "Z")
        approval = _make_approval(status="pending", requested_at=old_time)
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=None),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
                approval_ttl_seconds=900,
            )

        assert result["status"] == "expired"

    async def test_recent_approval_not_expired(self) -> None:
        """A recently created approval passes TTL check."""
        approval = _make_approval(status="pending")
        resolved = dict(
            approval,
            status="approved", decision="approved",
            decision_actor="user", resolved_at="now",
        )
        registration = _fake_registration()
        execute_mock = AsyncMock(return_value={"ok": True})

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
            patch("server_modules.gateway_approval_service.gateway_state_repository.resolve_gateway_action_approval_atomic", return_value=resolved),
            patch("server_modules.gateway_approval_service.gateway_state_repository.record_gateway_event"),
            patch("server_modules.gateway_approval_service.gateway_activity_service.emit_gateway_approval_resolved", AsyncMock()),
            patch("server_modules.gateway_approval_service.gateway_state_repository.mark_gateway_action_approval_executed", return_value={**resolved, "status": "executed"}),
            patch("server_modules.gateway_approval_service.gateway_activity_service.append_gateway_activity", AsyncMock()),
        ):
            result = await gateway_approval_service.resolve_gateway_tool_approval(
                registration=registration,
                approval_id=approval["approval_id"],
                decision="approved",
                actor="user",
                execute_fn=execute_mock,
                approval_ttl_seconds=900,
            )

        assert result["status"] == "executed"
        execute_mock.assert_awaited_once()

    # -- Validation errors --------------------------------------------------

    async def test_invalid_decision_raises(self) -> None:
        approval = _make_approval()
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
        ):
            with pytest.raises(ValueError, match="decision must be approved or rejected"):
                await gateway_approval_service.resolve_gateway_tool_approval(
                    registration=registration,
                    approval_id=approval["approval_id"],
                    decision="invalid",
                    actor="user",
                )

    async def test_scope_mismatch_raises(self) -> None:
        approval = _make_approval()
        registration = _fake_registration(gateway_id="other-gw")

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=approval),
        ):
            with pytest.raises(ValueError, match="scope mismatch"):
                await gateway_approval_service.resolve_gateway_tool_approval(
                    registration=registration,
                    approval_id=approval["approval_id"],
                    decision="approved",
                    actor="user",
                )

    async def test_not_found_raises(self) -> None:
        registration = _fake_registration()

        with (
            patch("server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval", return_value=None),
        ):
            with pytest.raises(ValueError, match="was not found"):
                await gateway_approval_service.resolve_gateway_tool_approval(
                    registration=registration,
                    approval_id="nonexistent",
                    decision="approved",
                    actor="user",
                )
