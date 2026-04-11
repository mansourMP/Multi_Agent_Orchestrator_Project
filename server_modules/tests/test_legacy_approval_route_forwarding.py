import asyncio
import unittest
from unittest.mock import patch

from server_modules import runs_history


class _ApprovalPayload:
    def __init__(self, decision: str, note: str = "") -> None:
        self.decision = decision
        self.note = note

    def validate_fields(self) -> None:
        return None


class LegacyApprovalRouteForwardingTests(unittest.TestCase):
    def test_list_pending_approvals_forwards_to_runtime_helper(self):
        current_user = {"user_id": "user-1"}

        with patch.object(
            runs_history.runtime_run_approval_service,
            "list_pending_approvals_payload",
            return_value={"items": [{"approval_id": "approval-1"}], "count": 1},
        ) as helper:
            payload = asyncio.run(
                runs_history.list_pending_approvals(
                    workspace_id="ws-1",
                    limit=5,
                    current_user=current_user,
                )
            )

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["items"][0]["approval_id"], "approval-1")
        self.assertEqual(helper.call_args.kwargs["workspace_id"], "ws-1")
        self.assertEqual(helper.call_args.kwargs["current_user"], current_user)

    def test_list_cognitive_approvals_maps_runtime_items_to_legacy_shape(self):
        with patch.object(
            runs_history.runtime_run_approval_service,
            "list_pending_approvals_payload",
            return_value={
                "items": [
                    {
                        "approval_id": "approval-1",
                        "run_id": "run-1",
                        "workspace_id": "ws-1",
                        "summary": "Approve send",
                        "status": "pending",
                        "action": "email_send",
                    }
                ],
                "count": 1,
            },
        ):
            payload = asyncio.run(runs_history.list_cognitive_approvals(limit=5))

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["source"], "runtime")
        self.assertEqual(payload["items"][0]["event_id"], "approval-1")
        self.assertEqual(payload["items"][0]["objective_id"], "run-1")

    def test_resolve_cognitive_approval_forwards_to_runtime_resolver(self):
        with patch.object(
            runs_history.runtime_run_approval_service,
            "resolve_standalone_approval_with_runtime_defaults",
            return_value={
                "approval_id": "approval-1",
                "run_id": "run-1",
                "resolution": "approved",
                "actor": "user",
                "reason": "ok",
                "correlation_id": "corr-1",
                "outbox_event": {"event_id": "evt-1"},
            },
        ) as helper:
            payload = asyncio.run(
                runs_history.resolve_cognitive_approval(
                    "approval-1",
                    _ApprovalPayload("approve", "ok"),
                )
            )

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["event_id"], "approval-1")
        self.assertEqual(payload["status"], "approved")
        self.assertEqual(helper.call_args.kwargs["payload"]["resolution"], "approved")


if __name__ == "__main__":
    unittest.main()
