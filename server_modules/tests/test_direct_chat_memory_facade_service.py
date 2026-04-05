import unittest

from server_modules import direct_chat_memory_facade_service as service


class DirectChatMemoryFacadeServiceTests(unittest.TestCase):
    def test_persist_direct_chat_transcript_best_effort_swallow_errors(self) -> None:
        called = {"count": 0}

        def boom(**kwargs):
            called["count"] += 1
            raise RuntimeError("fail")

        service.persist_direct_chat_transcript_best_effort(
            workspace_id="default",
            thread_id="thread-1",
            provider="openai",
            model="gpt-5.4",
            messages=[],
            user_message="hello",
            assistant_reply="hi",
            save_session_transcript_fn=boom,
        )

        self.assertEqual(called["count"], 1)

    def test_persist_direct_chat_transcript_best_effort_passes_payload(self) -> None:
        captured = {}

        def save(**kwargs):
            captured.update(kwargs)

        service.persist_direct_chat_transcript_best_effort(
            workspace_id="default",
            thread_id="thread-1",
            provider="openai",
            model="gpt-5.4",
            messages=[{"role": "user", "content": "hello"}],
            user_message="hello",
            assistant_reply="hi",
            save_session_transcript_fn=save,
        )

        self.assertEqual(captured["thread_id"], "thread-1")
        self.assertEqual(captured["assistant_reply"], "hi")

    def test_build_direct_chat_daily_log_summary_delegates(self) -> None:
        summary = service.build_direct_chat_daily_log_summary(
            user_message="hello",
            assistant_reply="hi",
        )

        self.assertIn("- User: hello", summary)
        self.assertIn("- Assistant: hi", summary)


if __name__ == "__main__":
    unittest.main()
