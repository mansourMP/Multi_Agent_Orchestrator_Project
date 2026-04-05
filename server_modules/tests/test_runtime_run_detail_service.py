import unittest

from server_modules import runtime_run_detail_service


class RuntimeRunDetailServiceTests(unittest.TestCase):
    def test_can_view_sensitive_run_payload_accepts_api_key_and_admin(self):
        self.assertTrue(runtime_run_detail_service.can_view_sensitive_run_payload({"auth_type": "api_key"}))
        self.assertTrue(runtime_run_detail_service.can_view_sensitive_run_payload({"is_admin": True}))
        self.assertFalse(runtime_run_detail_service.can_view_sensitive_run_payload({"auth_type": "session"}))

    def test_limited_result_data_view_trims_execution_summary(self):
        payload = runtime_run_detail_service.limited_result_data_view(
            {
                "summary": "done",
                "pack_id": "pack-1",
                "execution_summary": {
                    "risk_level": "medium",
                    "next_action": "approve",
                    "approval_required": True,
                    "approval_reason": "writes data",
                    "estimated_time_saved_minutes": 12,
                    "ignored": "value",
                },
            }
        )

        self.assertEqual(payload["summary"], "done")
        self.assertNotIn("ignored", payload["execution_summary"])

    def test_build_archived_run_detail_response_sets_archived_and_route(self):
        payload = runtime_run_detail_service.build_archived_run_detail_response(
            run_id="run-1",
            snapshot={
                "status": "completed",
                "execution_target_requested": "cloud",
                "execution_target_selected": "cloud",
                "fallback_reason": "provider_unavailable",
            },
            metadata={"agent_role": "builder"},
            include_sensitive=False,
            safe_context={"workspace_id": "default"},
            parent_run=None,
            child_runs=[],
            delegation_summary={},
            connector_binding={},
            limited_result_data_view_fn=lambda value: {"summary": "trimmed"},
            limited_node_states_view_fn=lambda value: {"trimmed": True},
        )

        self.assertTrue(payload["archived"])
        self.assertEqual(payload["route"]["requested"], "cloud")
        self.assertEqual(payload["fallback_reason"], "provider_unavailable")

    def test_build_live_run_detail_response_uses_trimmed_memory_and_pending_confirmation(self):
        payload = runtime_run_detail_service.build_live_run_detail_response(
            run_id="run-1",
            run={
                "status": "running",
                "result_data": {"secret": True},
                "memory_trace": {"raw": True},
                "tool_policy_audit": [{"event": "audit"}],
            },
            snapshot={},
            metadata={"owner_user_id": "user-1", "execution_target_requested": "local"},
            include_sensitive=True,
            safe_context={"workspace_id": "default"},
            parent_run=None,
            child_runs=[],
            delegation_summary={},
            connector_binding={},
            limited_result_data_view_fn=lambda value: {"summary": "trimmed"},
            limited_node_states_view_fn=lambda value: {"trimmed": True},
            trim_memory_trace_fn=lambda value: {"trimmed": bool(value)},
            get_pending_confirmation_fn=lambda run: {"approval_id": "approval-1"},
        )

        self.assertFalse(payload["archived"])
        self.assertEqual(payload["memory_trace"], {"trimmed": True})
        self.assertEqual(payload["pending_confirmation"]["approval_id"], "approval-1")


if __name__ == "__main__":
    unittest.main()
