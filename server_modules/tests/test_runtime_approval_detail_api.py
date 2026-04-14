import queue
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from server_modules import runtime_run_approval_service


class RuntimeApprovalDetailApiTests(unittest.TestCase):
    def test_build_approval_detail_response_returns_authoritative_record(self):
        approval_record = {
            "approval_id": "approval-1",
            "run_id": "run-1",
            "workspace_id": "ws-1",
            "tenant_id": "tenant-1",
            "owner_user_id": "user-1",
            "status": "requested",
            "prompt": "Approve deploy",
            "requested_at": "2026-04-13T10:00:00Z",
            "request_payload": {"approval_id": "approval-1"},
            "decision_payload": {},
            "metadata": {},
        }
        run_snapshot = {
            "source": "live",
            "payload": {
                "run_id": "run-1",
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "status": "waiting_for_input",
                "context": {"metadata": {"owner_user_id": "user-1"}},
            },
        }

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value=approval_record,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_run_snapshot_for_approval_id",
            return_value=run_snapshot,
        ):
            payload = runtime_run_approval_service.build_approval_detail_response(
                "approval-1",
                current_user={"user_id": "user-1", "email": "user-1@example.com"},
                enforce_workspace_access_fn=lambda current_user, workspace_id, minimum_role="viewer": workspace_id,
                workspace_entitlement_payload_fn=lambda cache, workspace_id: {"capabilities": {"approvals_enabled": True}},
                current_user_is_privileged_fn=lambda current_user: False,
                enforce_run_owner_access_fn=lambda current_user, payload: None,
            )

        self.assertEqual(payload["approval_id"], "approval-1")
        self.assertEqual(payload["run"]["run_id"], "run-1")
        self.assertEqual(payload["run"]["status"], "waiting_for_input")

    def test_build_approval_detail_response_rejects_other_owner(self):
        approval_record = {
            "approval_id": "approval-1",
            "run_id": "run-1",
            "workspace_id": "ws-1",
            "tenant_id": "tenant-1",
            "owner_user_id": "owner-1",
            "owner_email": "owner@example.com",
            "status": "requested",
            "prompt": "Approve deploy",
            "request_payload": {},
            "decision_payload": {},
            "metadata": {},
        }

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value=approval_record,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_run_snapshot_for_approval_id",
            return_value=None,
        ):
            with self.assertRaises(HTTPException) as exc:
                runtime_run_approval_service.build_approval_detail_response(
                    "approval-1",
                    current_user={"user_id": "user-2", "email": "user-2@example.com"},
                    enforce_workspace_access_fn=lambda current_user, workspace_id, minimum_role="viewer": workspace_id,
                    workspace_entitlement_payload_fn=lambda cache, workspace_id: {"capabilities": {"approvals_enabled": True}},
                    current_user_is_privileged_fn=lambda current_user: False,
                )

        self.assertEqual(exc.exception.status_code, 403)

    def test_resolve_standalone_approval_restores_from_repository_snapshot_without_in_memory_run(self):
        approval_record = {
            "approval_id": "approval-1",
            "run_id": "run-1",
            "workspace_id": "ws-1",
            "tenant_id": "tenant-1",
        }
        repository_run = {
            "run_id": "run-1",
            "status": "waiting_for_input",
            "context": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "metadata": {"trace_id": "trace-1"},
            },
            "pending_confirmation": {"approval_id": "approval-1", "correlation_id": "corr-1"},
        }
        captured = {}

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value=approval_record,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_run_snapshot_for_approval_id",
            return_value={"source": "live", "payload": repository_run},
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_live_run_by_approval_id",
            return_value=None,
        ):
            payload = runtime_run_approval_service.resolve_standalone_approval(
                "approval-1",
                payload={"approval_id": "approval-1", "resolution": "approved", "actor": "user-1", "reason": "ok"},
                current_user={"user_id": "user-1"},
                runs={},
                resolve_run_approval_fn=lambda run_id, approval_id, **kwargs: (
                    captured.setdefault("run", kwargs.get("run")),
                    {"status": "ok", "run_id": run_id, "approval_id": approval_id},
                )[1],
                resolve_run_approval_callbacks={
                    "ensure_live_run_handle": lambda run_id, run_record: {
                        **run_record,
                        "logs": object(),
                        "input_queue": queue.Queue(),
                    },
                },
                record_approval_resolution_fn=lambda *args: None,
                emit_approval_resolved_event_fn=lambda **kwargs: type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-1",
                        "event_type": "approval_resolved",
                        "trace_id": "trace-1",
                        "payload": kwargs,
                    },
                )(),
            )

        self.assertEqual(payload["run_id"], "run-1")
        self.assertIsInstance(captured["run"], dict)
        self.assertEqual(captured["run"]["run_id"], "run-1")


if __name__ == "__main__":
    unittest.main()
