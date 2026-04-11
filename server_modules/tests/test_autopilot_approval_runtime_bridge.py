import unittest

from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService


class _CognitiveGuard:
    def __init__(self) -> None:
        self.list_calls = 0
        self.resolve_calls = 0

    def list_pending_approvals(self, **kwargs):
        self.list_calls += 1
        raise AssertionError("runtime bridge should handle approvals_list before cognitive fallback")

    def resolve_event_approval(self, **kwargs):
        self.resolve_calls += 1
        raise AssertionError("runtime bridge should handle approval_resolve before cognitive fallback")


class AutopilotApprovalRuntimeBridgeTests(unittest.TestCase):
    def _make_service(self, **overrides):
        cognitive = overrides.pop("cognitive", _CognitiveGuard())
        return AutopilotApprovalService(
            default_chat_prefix="/empyralis",
            cognitive_module=overrides.pop("cognitive_module", lambda: cognitive),
            cognitive_defaults=overrides.pop("cognitive_defaults", lambda: {"db_path": "/tmp/db", "niche_id": "astronomy"}),
            truncate_one_line=overrides.pop("truncate_one_line", lambda text, limit: str(text)[:limit]),
            normalize_string_list=overrides.pop("normalize_string_list", lambda value: list(value) if isinstance(value, list) else []),
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-05T00:00:00Z"),
            send_message=overrides.pop("send_message", lambda **kwargs: None),
            ensure_workspace_approvals_access=overrides.pop("ensure_workspace_approvals_access", None),
            runtime_approvals_list=overrides.pop("runtime_approvals_list", None),
            runtime_approval_resolve=overrides.pop("runtime_approval_resolve", None),
        )

    def test_approvals_list_uses_runtime_bridge(self):
        calls = []
        service = self._make_service(
            runtime_approvals_list=lambda limit, workspace_id=None: calls.append((limit, workspace_id)) or {
                "ok": True,
                "items": [{"approval_id": "approval-1", "prompt": "Approve", "status": "pending"}],
                "count": 1,
            }
        )

        payload = service.approvals_list(limit=3, workspace_id="ws-1")

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["items"][0]["event_id"], "approval-1")
        self.assertEqual(calls, [(3, "ws-1")])

    def test_approval_resolve_uses_runtime_bridge(self):
        calls = []
        service = self._make_service(
            runtime_approval_resolve=lambda event_id, approved, note, workspace_id=None: calls.append((event_id, approved, note, workspace_id)) or {
                "ok": True,
                "approval_id": event_id,
                "resolution": "approved" if approved else "rejected",
            }
        )

        payload = service.approval_resolve("approval-1", True, "ok", workspace_id="ws-1")

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["event_id"], "approval-1")
        self.assertEqual(payload["status"], "approved")
        self.assertEqual(calls, [("approval-1", True, "ok", "ws-1")])


if __name__ == "__main__":
    unittest.main()
