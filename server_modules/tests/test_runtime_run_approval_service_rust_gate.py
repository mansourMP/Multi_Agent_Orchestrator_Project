import unittest
from fastapi import HTTPException
from unittest import mock

from server_modules import runtime_run_approval_service


class RuntimeRunApprovalServiceRustGateTests(unittest.TestCase):
    def test_create_request_accepts_canonical_rust_action(self) -> None:
        with mock.patch.object(
            runtime_run_approval_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            return_value={
                "ok": True,
                "decision": "allow",
                "reason": "run_approval_create_allowed",
                "operation": "create_request",
                "next_action": "create_or_update_approval_request",
            },
        ):
            decision = runtime_run_approval_service._enforce_rust_run_approval_decision(
                operation="create_request",
                run_id="run-1",
                approval_id="approval-1",
                run={"context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {}}},
                payload={"prompt": "Approve this"},
                current_user={"user_id": "user-1", "role": "system", "auth_type": "api_key"},
            )

        self.assertEqual(decision["next_action"], "create_or_update_approval_request")

    def test_resolve_approval_wrong_rust_action_blocks(self) -> None:
        with mock.patch.object(
            runtime_run_approval_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            return_value={
                "ok": True,
                "decision": "allow",
                "reason": "run_approval_resolution_allowed",
                "operation": "resolve_approval",
                "next_action": "submit_run_decision",
            },
        ):
            with self.assertRaises(HTTPException) as raised:
                runtime_run_approval_service._enforce_rust_run_approval_decision(
                    operation="resolve_approval",
                    run_id="run-1",
                    approval_id="approval-1",
                    run={"context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {}}},
                    payload={"decision": "approve"},
                    pending={"status": "pending"},
                    current_user={"user_id": "user-1", "role": "owner"},
                )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("unexpected_next_action:submit_run_decision", str(raised.exception.detail))

    def test_list_pending_wrong_rust_action_blocks_before_repository_read(self) -> None:
        list_pending = mock.Mock(return_value=[])
        with mock.patch.object(
            runtime_run_approval_service.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            return_value={
                "ok": True,
                "decision": "allow",
                "reason": "run_approval_list_allowed",
                "operation": "list_pending",
                "next_action": "build_approval_detail_response",
            },
        ):
            with self.assertRaises(HTTPException) as raised:
                runtime_run_approval_service.list_pending_approvals_payload(
                    workspace_id="ws-1",
                    current_user={"user_id": "user-1", "role": "owner"},
                    enforce_workspace_access_fn=lambda current_user, workspace_id, minimum_role="viewer": workspace_id,
                    workspace_entitlement_payload_fn=lambda cache, workspace_id: {"capabilities": {"approvals_enabled": True}},
                    current_user_is_privileged_fn=lambda current_user: True,
                    list_pending_approvals_fn=list_pending,
                    list_live_runs_fn=lambda: [],
                )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("unexpected_next_action:build_approval_detail_response", str(raised.exception.detail))
        list_pending.assert_not_called()

    def test_get_detail_wrong_rust_action_blocks_before_response_build(self) -> None:
        with (
            mock.patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_get_approval_record",
                return_value={
                    "approval_id": "approval-1",
                    "run_id": "run-1",
                    "workspace_id": "ws-1",
                    "owner_user_id": "user-1",
                    "status": "requested",
                    "metadata": {},
                },
            ),
            mock.patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_find_run_snapshot_for_approval_id",
                return_value=None,
            ),
            mock.patch.object(
                runtime_run_approval_service.rust_runtime_kernel_client,
                "run_runtime_kernel_enforced",
                return_value={
                    "ok": True,
                    "decision": "allow",
                    "reason": "run_approval_detail_allowed",
                    "operation": "get_detail",
                    "next_action": "include_approval_item",
                },
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                runtime_run_approval_service.build_approval_detail_response(
                    "approval-1",
                    current_user={"user_id": "user-1", "role": "owner"},
                )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn("unexpected_next_action:include_approval_item", str(raised.exception.detail))


if __name__ == "__main__":
    unittest.main()
