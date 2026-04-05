import threading
import unittest

from server_modules import runtime_webhook_trigger_service


class RuntimeWebhookTriggerServiceTests(unittest.TestCase):
    def test_load_webhook_triggers_populates_registry(self):
        triggers = {}

        loaded = runtime_webhook_trigger_service.load_webhook_triggers(
            triggers,
            lock=threading.Lock(),
            loaded=False,
            path="/tmp/webhooks.json",
            safe_read_json=lambda path, default: {"items": [{"id": "trigger-1", "workspace_id": "default"}]},
        )

        self.assertTrue(loaded)
        self.assertIn("trigger-1", triggers)

    def test_match_webhook_trigger_filters_by_workspace_and_pattern(self):
        trigger = runtime_webhook_trigger_service.match_webhook_trigger(
            {
                "trigger-1": {
                    "id": "trigger-1",
                    "workspace_id": "default",
                    "url_pattern": "*/webhooks/ingest/default",
                    "enabled": True,
                }
            },
            lock=threading.Lock(),
            workspace_id="default",
            request_url="https://example.com/webhooks/ingest/default",
        )

        self.assertEqual(trigger["id"], "trigger-1")

    def test_build_webhook_trigger_normalizes_optional_fields(self):
        trigger = runtime_webhook_trigger_service.build_webhook_trigger(
            trigger_id="trigger-1",
            workspace_id="",
            url_pattern="/hook",
            workflow_id="wf-1",
            user_goal="",
            metadata=None,
            enabled=1,
            now_ts=123.0,
        )

        self.assertEqual(trigger["workspace_id"], "default")
        self.assertIsNone(trigger["user_goal"])
        self.assertEqual(trigger["metadata"], {})
        self.assertTrue(trigger["enabled"])
        self.assertEqual(trigger["created_at"], 123.0)


if __name__ == "__main__":
    unittest.main()
