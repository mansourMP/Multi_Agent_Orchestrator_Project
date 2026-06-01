from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from server_modules import sage_approval_service


_ALLOW_DECISION = {
    "ok": True,
    "decision": "allow",
    "reason": "runtime_state_store_policy_satisfied",
    "operation": "runtime-state-store-decision",
    "next_action": "create_sage_approval",
    "approval_required": False,
    "cacheable": False,
    "audit_visibility": "standard",
}


def _approval_payload() -> dict:
    return {
        "channel": "email",
        "recipient": "owner@example.com",
        "message_text": "Ship the approved draft.",
    }


class SageApprovalServiceRustGateTests(unittest.TestCase):
    def _workspace_scope(self, root: Path):
        return lambda workspace_id: root / str(workspace_id or "default")

    def test_create_approval_calls_rust_before_persisting(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with mock.patch.object(
                sage_approval_service.workspace_context,
                "workspace_scope_dir",
                side_effect=self._workspace_scope(root),
            ), mock.patch.object(
                sage_approval_service.rust_runtime_kernel_client,
                "runtime_state_store_decision",
                return_value=dict(_ALLOW_DECISION),
            ) as rust_decision:
                record = sage_approval_service.create_approval(
                    workspace_id="workspace-1",
                    tenant_id="tenant-1",
                    trace_id="trace-1",
                    action="channel_send_draft",
                    description="Approve draft",
                    action_payload=_approval_payload(),
                    requester_actor="owner-1",
                )

            state_path = root / "workspace-1" / "sage_approvals.json"
            self.assertTrue(state_path.exists())
            payload = rust_decision.call_args.kwargs
            self.assertEqual(payload["operation"], "create_sage_approval")
            self.assertEqual(payload["state_class"], "sage_approvals")
            self.assertEqual(payload["workspace_id"], "workspace-1")
            self.assertEqual(payload["actor_id"], "owner-1")
            self.assertEqual(payload["trace_id"], "trace-1")
            self.assertEqual(payload["payload"]["approval_token"], record.approval_token)

    def test_create_approval_blocks_before_persisting_when_rust_blocks(self) -> None:
        block_decision = {
            **_ALLOW_DECISION,
            "ok": False,
            "decision": "block",
            "reason": "owner_access_denied",
            "operation": "create_sage_approval",
            "audit_visibility": "security",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with mock.patch.object(
                sage_approval_service.workspace_context,
                "workspace_scope_dir",
                side_effect=self._workspace_scope(root),
            ), mock.patch.object(
                sage_approval_service.rust_runtime_kernel_client,
                "runtime_state_store_decision",
                return_value=block_decision,
            ):
                with self.assertRaises(sage_approval_service.SageApprovalRustGateError):
                    sage_approval_service.create_approval(
                        workspace_id="workspace-1",
                        tenant_id="tenant-1",
                        trace_id="trace-1",
                        action="channel_send_draft",
                        description="Approve draft",
                        action_payload=_approval_payload(),
                        requester_actor="owner-1",
                    )

            self.assertFalse((root / "workspace-1" / "sage_approvals.json").exists())

    def test_create_approval_blocks_before_persisting_on_wrong_rust_action(self) -> None:
        wrong_action = {
            **_ALLOW_DECISION,
            "next_action": "write_profile_api_file",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with mock.patch.object(
                sage_approval_service.workspace_context,
                "workspace_scope_dir",
                side_effect=self._workspace_scope(root),
            ), mock.patch.object(
                sage_approval_service.rust_runtime_kernel_client,
                "runtime_state_store_decision",
                return_value=wrong_action,
            ):
                with self.assertRaises(sage_approval_service.SageApprovalRustGateError) as raised:
                    sage_approval_service.create_approval(
                        workspace_id="workspace-1",
                        tenant_id="tenant-1",
                        trace_id="trace-1",
                        action="channel_send_draft",
                        description="Approve draft",
                        action_payload=_approval_payload(),
                        requester_actor="owner-1",
                    )

            self.assertEqual(str(raised.exception), "unexpected_next_action")
            self.assertFalse((root / "workspace-1" / "sage_approvals.json").exists())

    def test_resolve_and_consume_approval_require_rust_decisions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with mock.patch.object(
                sage_approval_service.workspace_context,
                "workspace_scope_dir",
                side_effect=self._workspace_scope(root),
            ), mock.patch.object(
                sage_approval_service.rust_runtime_kernel_client,
                "runtime_state_store_decision",
                side_effect=[
                    dict(_ALLOW_DECISION),
                    {**_ALLOW_DECISION, "next_action": "resolve_sage_approval"},
                    {**_ALLOW_DECISION, "next_action": "consume_sage_approval"},
                ],
            ) as rust_decision:
                record = sage_approval_service.create_approval(
                    workspace_id="workspace-1",
                    tenant_id="tenant-1",
                    trace_id="trace-1",
                    action="channel_send_draft",
                    description="Approve draft",
                    action_payload=_approval_payload(),
                    requester_actor="owner-1",
                )
                sage_approval_service.resolve_approval(
                    approval_token=record.approval_token,
                    workspace_id="workspace-1",
                    status="approved",
                    resolution_actor="owner-1",
                )
                sage_approval_service.consume_approval(
                    approval_token=record.approval_token,
                    workspace_id="workspace-1",
                )

            operations = [call.kwargs["operation"] for call in rust_decision.call_args_list]
            self.assertIn("create_sage_approval", operations)
            self.assertIn("resolve_sage_approval", operations)
            self.assertIn("consume_sage_approval", operations)

    def test_expire_stale_approvals_requires_rust_decision_before_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with mock.patch.object(
                sage_approval_service.workspace_context,
                "workspace_scope_dir",
                side_effect=self._workspace_scope(root),
            ), mock.patch.object(
                sage_approval_service.rust_runtime_kernel_client,
                "runtime_state_store_decision",
                side_effect=[
                    dict(_ALLOW_DECISION),
                    {**_ALLOW_DECISION, "next_action": "expire_sage_approvals"},
                ],
            ) as rust_decision:
                record = sage_approval_service.create_approval(
                    workspace_id="workspace-1",
                    tenant_id="tenant-1",
                    trace_id="trace-1",
                    action="channel_send_draft",
                    description="Approve draft",
                    action_payload=_approval_payload(),
                    requester_actor="owner-1",
                )
                state_path = root / "workspace-1" / "sage_approvals.json"
                state = json.loads(state_path.read_text(encoding="utf-8"))
                state["records"][record.approval_token]["expires_at"] = "2000-01-01T00:00:00Z"
                state_path.write_text(json.dumps(state), encoding="utf-8")

                rust_decision.reset_mock()
                expired_count = sage_approval_service.expire_stale_approvals(workspace_id="workspace-1")

            self.assertEqual(expired_count, 1)
            payload = rust_decision.call_args.kwargs
            self.assertEqual(payload["operation"], "expire_sage_approvals")
            self.assertEqual(payload["state_class"], "sage_approvals")
            self.assertEqual(payload["workspace_id"], "workspace-1")
            self.assertEqual(payload["status"], "expired")


if __name__ == "__main__":
    unittest.main()
