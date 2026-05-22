from __future__ import annotations

import unittest

from server_modules import hardware_runtime_session_service as sessions


class HardwareRuntimeSessionServiceTests(unittest.TestCase):
    def test_session_view_preserves_runtime_contract_metadata(self) -> None:
        view = sessions.session_view(
            "hrs-1",
            {
                "state": "waiting_approval",
                "runtime_target": "local_companion",
                "canonical_runtime_target": "user_device_gateway",
                "runtime_access_mode": "default_guarded",
                "thread_id": "thread-1",
                "request_id": "req-1",
                "approvals": [{"approval_id": "approval-1"}],
                "artifacts": ["artifact-1"],
            },
        )

        self.assertEqual(view["session_id"], "hrs-1")
        self.assertEqual(view["runtime_session_binding"], "sage_hardware_action")
        self.assertEqual(view["state"], "waiting_approval")
        self.assertEqual(view["canonical_runtime_target"], "user_device_gateway")
        self.assertEqual(view["runtime_access_mode"], "default_guarded")
        self.assertEqual(view["request_id"], "req-1")
        self.assertEqual(view["approvals"][0]["approval_id"], "approval-1")
        self.assertEqual(view["artifacts"], ["artifact-1"])

    def test_runtime_session_with_correlation_fills_missing_context(self) -> None:
        session = sessions.runtime_session_with_correlation(
            {"session_id": "hrs-1"},
            payload={"thread_id": "thread-1", "request_id": "req-1"},
            session_record={"trace_id": "trace-1"},
        )

        self.assertEqual(session["thread_id"], "thread-1")
        self.assertEqual(session["request_id"], "req-1")
        self.assertEqual(session["trace_id"], "trace-1")


if __name__ == "__main__":
    unittest.main()
