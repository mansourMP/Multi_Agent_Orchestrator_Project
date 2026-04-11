import unittest

from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService


class _CognitiveStub:
    def __init__(self) -> None:
        self.list_calls = []
        self.resolve_calls = []

    def list_pending_approvals(self, **kwargs):
        self.list_calls.append(kwargs)
        return [
            {
                "event_id": "abc12345-1111",
                "risk_level": "medium",
                "summary": "Needs approval",
                "objective_title": "Launch",
            }
        ]

    def resolve_event_approval(self, **kwargs):
        self.resolve_calls.append(kwargs)
        return {"ok": True, "event_id": kwargs["event_id"], "status": "approved"}


class AutopilotApprovalServiceTests(unittest.TestCase):
    def _make_service(self, **overrides):
        self.messages = overrides.pop("messages", [])
        self.mod = overrides.pop("mod", _CognitiveStub())
        self.runtime_items = overrides.pop(
            "runtime_items",
            [
                {
                    "approval_id": "abc12345-1111",
                    "summary": "Needs approval",
                    "status": "pending",
                    "action": "Launch",
                }
            ],
        )
        return AutopilotApprovalService(
            default_chat_prefix="/empyralis",
            cognitive_module=overrides.pop("cognitive_module", lambda: self.mod),
            cognitive_defaults=overrides.pop("cognitive_defaults", lambda: {"db_path": "/tmp/db", "niche_id": "astronomy"}),
            truncate_one_line=overrides.pop("truncate_one_line", lambda text, limit: str(text)[:limit]),
            normalize_string_list=overrides.pop("normalize_string_list", lambda value: list(value) if isinstance(value, list) else []),
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-05T00:00:00Z"),
            send_message=overrides.pop("send_message", lambda **kwargs: self.messages.append(kwargs)),
            ensure_workspace_approvals_access=overrides.pop("ensure_workspace_approvals_access", None),
            runtime_approvals_list=overrides.pop(
                "runtime_approvals_list",
                lambda limit, workspace_id=None: {"ok": True, "items": self.runtime_items[:limit], "count": min(limit, len(self.runtime_items))},
            ),
            runtime_approval_resolve=overrides.pop(
                "runtime_approval_resolve",
                lambda event_id, approved, note, workspace_id=None: {
                    "ok": True,
                    "approval_id": event_id,
                    "resolution": "approved" if approved else "rejected",
                },
            ),
        )

    def test_approvals_text_formats_items(self):
        service = self._make_service()
        text = service.approvals_text(service.approvals_list(limit=5, workspace_id="ws-1"), prefix="/ops")
        self.assertIn("Pending approvals:", text)
        self.assertIn("/ops approve", text)

    def test_notify_pending_approvals_sends_only_new_items(self):
        service = self._make_service()
        patch = service.notify_pending_approvals(
            connector_state={"notified_approval_ids": []},
            bot_token="bot",
            chat_id="chat",
            workspace_id="ws",
            profile={"prefix": "/emp"},
            connector_id="conn",
        )
        self.assertEqual(patch["last_pending_approval_count"], 1)
        self.assertEqual(len(self.messages), 1)
        self.assertIn("Approval required", self.messages[0]["text"])

    def test_approval_result_text_handles_failure(self):
        service = self._make_service()
        text = service.approval_result_text({"ok": False, "error": "bad"}, approved=True)
        self.assertEqual(text, "Approval update failed: bad")

    def test_approvals_list_rejects_workspace_without_capability(self):
        service = self._make_service(
            ensure_workspace_approvals_access=lambda workspace_id: (_ for _ in ()).throw(RuntimeError("Approvals are not included in this workspace plan."))
        )

        payload = service.approvals_list(limit=5, workspace_id="workspace-free")

        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"], "Approvals are not included in this workspace plan.")


if __name__ == "__main__":
    unittest.main()
