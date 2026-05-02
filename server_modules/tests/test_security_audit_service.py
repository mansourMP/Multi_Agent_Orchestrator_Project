import unittest
from unittest.mock import patch

from server_modules import security_audit_service


class SecurityAuditServiceTests(unittest.TestCase):
    def test_emit_security_audit_event_redacts_sensitive_metadata(self):
        captured = {}

        def fake_emit_runtime_event(**kwargs):
            captured.update(kwargs)
            return {"id": "event-1"}

        with patch(
            "server_modules.security_audit_service.outbox_service.emit_runtime_event",
            side_effect=fake_emit_runtime_event,
        ):
            security_audit_service.emit_security_audit_event(
                action="provider.saved",
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                current_user={"user_id": "user-1", "email": "USER@EXAMPLE.COM"},
                metadata={
                    "provider": "openai",
                    "api_key": "sk-live_1234567890",
                    "nested": {
                        "Authorization": "Bearer abc.def.ghi",
                        "safe": "kept",
                    },
                    "items": [
                        {
                            "pairing_token": "gpair_secret-token",
                            "note": "Authorization: Bearer token-value",
                        }
                    ],
                },
            )

        metadata = captured["payload"]["metadata"]
        self.assertEqual(metadata["provider"], "openai")
        self.assertEqual(metadata["api_key"], "[redacted]")
        self.assertEqual(metadata["nested"]["Authorization"], "[redacted]")
        self.assertEqual(metadata["nested"]["safe"], "kept")
        self.assertEqual(metadata["items"][0]["pairing_token"], "[redacted]")
        self.assertIn("Bearer [redacted]", metadata["items"][0]["note"])
        self.assertEqual(captured["payload"]["actor_email"], "user@example.com")

    def test_sanitize_security_audit_metadata_handles_non_dict(self):
        self.assertEqual(security_audit_service.sanitize_security_audit_metadata(None), {})
        self.assertEqual(security_audit_service.sanitize_security_audit_metadata([]), {})


if __name__ == "__main__":
    unittest.main()
