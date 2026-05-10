from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules.sage_approval_service import (
    APPROVAL_TOKEN_PREFIX,
    APPROVAL_TTL_MINUTES,
    SageApprovalRecord,
    create_approval,
    get_approval,
    resolve_approval,
    consume_approval,
    expire_stale_approvals,
    list_pending_approvals,
)


def _workspace_scope_mock(tempdir: str, workspace_id: str) -> Path:
    return Path(tempdir) / workspace_id


class SageApprovalTokenCreationTests(unittest.TestCase):
    def test_create_approval_returns_record_with_token(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                record = create_approval(
                    workspace_id="ws-1",
                    tenant_id="t-1",
                    trace_id="trace-1",
                    action="channel_send_draft",
                    description="Send a test message",
                    action_payload={"channel": "whatsapp", "recipient": "test", "message_text": "hello"},
                    requester_actor="user-1",
                )

            self.assertIsInstance(record, SageApprovalRecord)
            self.assertTrue(record.approval_token.startswith(APPROVAL_TOKEN_PREFIX))
            self.assertEqual(record.status, "pending")
            self.assertEqual(record.workspace_id, "ws-1")
            self.assertEqual(record.tenant_id, "t-1")
            self.assertTrue((root / "sage_approvals.json").exists())

    def test_create_approval_rejects_unsupported_action(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                with self.assertRaises(ValueError):
                    create_approval(
                        workspace_id="ws-1",
                        tenant_id="t-1",
                        trace_id="trace-1",
                        action="unsupported_action",
                        description="Bad",
                        action_payload={},
                    )

    def test_create_approval_fail_closed_on_write_error(self):
        with patch("server_modules.sage_approval_service._write_state", side_effect=OSError("disk full")):
            with tempfile.TemporaryDirectory() as tempdir:
                root = Path(tempdir) / "ws-1"
                with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                    with self.assertRaises(RuntimeError):
                        create_approval(
                            workspace_id="ws-1",
                            tenant_id="t-1",
                            trace_id="trace-1",
                            action="channel_send_draft",
                            description="Send",
                            action_payload={"channel": "test", "recipient": "x", "message_text": "y"},
                        )


class SageApprovalTokenLifecycleTests(unittest.TestCase):
    def _create_test_approval(self, root: Path, **overrides) -> SageApprovalRecord:
        return create_approval(
            workspace_id=overrides.get("workspace_id", "ws-1"),
            tenant_id=overrides.get("tenant_id", "t-1"),
            trace_id=overrides.get("trace_id", "trace-1"),
            action=overrides.get("action", "channel_send_draft"),
            description=overrides.get("description", "Send a test message"),
            action_payload=overrides.get("action_payload", {"channel": "test", "recipient": "x", "message_text": "y"}),
            requester_actor=overrides.get("requester_actor", "user-1"),
        )

    def test_get_approval_retrieves_record(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                retrieved = get_approval(approval_token=created.approval_token, workspace_id="ws-1")

            self.assertIsNotNone(retrieved)
            self.assertEqual(retrieved.approval_token, created.approval_token)
            self.assertEqual(retrieved.status, "pending")

    def test_approve_changes_status(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                resolved = resolve_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                    status="approved",
                    resolution_actor="user-1",
                )

            self.assertEqual(resolved.status, "approved")
            self.assertIsNotNone(resolved.resolved_at)

    def test_reject_changes_status(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                resolved = resolve_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                    status="rejected",
                )

            self.assertEqual(resolved.status, "rejected")

    def test_single_use_enforcement(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                resolve_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                    status="approved",
                )
                with self.assertRaises(ValueError) as ctx:
                    resolve_approval(
                        approval_token=created.approval_token,
                        workspace_id="ws-1",
                        status="approved",
                    )
                self.assertIn("already", str(ctx.exception))

    def test_wrong_workspace_denied(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                with self.assertRaises(ValueError) as ctx:
                    resolve_approval(
                        approval_token=created.approval_token,
                        workspace_id="ws-2",
                        status="approved",
                    )
                self.assertIn("workspace", str(ctx.exception).lower())

    def test_expired_token_denied(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                with patch("server_modules.sage_approval_service._utc_now") as mock_now:
                    from datetime import datetime, timedelta, timezone
                    mock_now.return_value = datetime.now(timezone.utc) + timedelta(minutes=APPROVAL_TTL_MINUTES + 5)
                    with self.assertRaises(ValueError) as ctx:
                        resolve_approval(
                            approval_token=created.approval_token,
                            workspace_id="ws-1",
                            status="approved",
                        )
                    self.assertIn("expired", str(ctx.exception).lower())

    def test_reused_token_denied_after_reject(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                resolve_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                    status="rejected",
                )
                with self.assertRaises(ValueError) as ctx:
                    resolve_approval(
                        approval_token=created.approval_token,
                        workspace_id="ws-1",
                        status="approved",
                    )
                self.assertIn("already", str(ctx.exception))

    def test_actor_binding_preserved(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root, requester_actor="user-1")
                self.assertEqual(created.requester_actor, "user-1")

                with self.assertRaises(ValueError) as ctx:
                    resolve_approval(
                        approval_token=created.approval_token,
                        workspace_id="ws-1",
                        status="approved",
                        resolution_actor="user-2",
                    )
                self.assertIn("requester", str(ctx.exception).lower())

    def test_expire_stale_approvals(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                with patch("server_modules.sage_approval_service._utc_now") as mock_now:
                    from datetime import datetime, timedelta, timezone
                    mock_now.return_value = datetime.now(timezone.utc) + timedelta(minutes=APPROVAL_TTL_MINUTES + 5)
                    expired = expire_stale_approvals(workspace_id="ws-1")

            self.assertEqual(expired, 1)

    def test_list_pending_approvals(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                self._create_test_approval(root)
                self._create_test_approval(root)

                pending = list_pending_approvals(workspace_id="ws-1")

            self.assertEqual(len(pending), 2)
            for p in pending:
                self.assertEqual(p["status"], "pending")
                self.assertTrue(p["approval_token"].startswith(APPROVAL_TOKEN_PREFIX))

    def test_consume_approval_marks_executed(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                resolve_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                    status="approved",
                    resolution_actor="user-1",
                )
                consumed = consume_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                )

            self.assertEqual(consumed.status, "consumed")
            self.assertEqual(consumed.approval_token, created.approval_token)
            with self.assertRaises(ValueError):
                consume_approval(
                    approval_token=created.approval_token,
                    workspace_id="ws-1",
                )

    def test_consume_non_approved_raises(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "ws-1"
            with patch("server_modules.sage_approval_service.workspace_context.workspace_scope_dir", return_value=root):
                created = self._create_test_approval(root)
                with self.assertRaises(ValueError) as ctx:
                    consume_approval(
                        approval_token=created.approval_token,
                        workspace_id="ws-1",
                    )
                self.assertIn("status", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()
