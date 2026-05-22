from __future__ import annotations

import unittest

from server_modules import transcript_events_service as service


class TranscriptEventsServiceTests(unittest.TestCase):
    def test_trace_sanitizer_keeps_user_visible_proof_only(self) -> None:
        event = service.build_transcript_event(
            "trace",
            {
                "trace_id": "trace-secret",
                "event_type": "tool.result",
                "tool_call_id": "tool-1",
                "data": {
                    "status": "completed",
                    "summary": "Ran command.",
                    "tool_name": "shell.execute",
                    "capability_id": "shell.execute",
                    "runtime_target": "self_hosted_node",
                    "runtime_access_mode": "full_access",
                    "runtime_session_id": "hrs-1",
                    "request_id": "request-secret",
                    "arguments": {"command": "rm -rf /tmp/demo"},
                    "args_preview": {"command": "rm -rf /tmp/demo"},
                    "raw_output": "hidden raw output",
                    "output": "hidden stdout",
                    "result": {"stdout": "hidden stdout"},
                    "prompt": "hidden prompt",
                    "provider": "deepseek",
                    "policy": {"internal": True},
                    "trace_id": "trace-secret",
                },
                "metadata": {
                    "status": "completed",
                    "summary": "Ran command.",
                    "trace_id": "trace-secret",
                    "request_id": "request-secret",
                    "provider_id": "deepseek",
                    "policy_metadata": {"internal": True},
                },
            },
        )

        self.assertIsNotNone(event)
        payload = event["payload"]
        self.assertEqual(payload["event_type"], "tool.result")
        self.assertEqual(payload["tool_call_id"], "tool-1")
        self.assertEqual(payload["data"]["summary"], "Ran command.")
        snapshot = repr(event)
        for token in (
            "trace-secret",
            "request-secret",
            "hidden raw output",
            "hidden stdout",
            "hidden prompt",
            "deepseek",
            "rm -rf /tmp/demo",
            "policy_metadata",
        ):
            self.assertNotIn(token, snapshot)

    def test_blocks_non_proof_stream_events(self) -> None:
        blocked_events = [
            ("chunk", {"delta": "assistant chunk"}),
            ("final", {"reply": "done"}),
            ("trace", {"event_type": "reasoning.summary.delta", "data": {"delta": "private"}}),
            ("trace", {"event_type": "prompt.rendered", "data": {"summary": "prompt leaked"}}),
            ("trace", {"event_type": "provider.model.selected", "data": {"summary": "model leaked"}}),
            ("step", {"kind": "thinking", "detail": "private thinking"}),
            ("step", {"kind": "assistant", "detail": "assistant text"}),
        ]

        for event_name, payload in blocked_events:
            with self.subTest(event_name=event_name, payload=payload):
                self.assertIsNone(service.build_transcript_event(event_name, payload))

    def test_step_events_require_known_user_visible_kind(self) -> None:
        allowed = service.build_transcript_event(
            "step",
            {"kind": "shell", "label": "Running command", "detail": "pwd", "status": "running"},
        )
        self.assertIsNotNone(allowed)
        self.assertEqual(allowed["payload"]["kind"], "shell")

        self.assertIsNone(
            service.build_transcript_event(
                "step",
                {"kind": "debug", "label": "Debug", "detail": "internal route"},
            )
        )


if __name__ == "__main__":
    unittest.main()
