import json
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import safe_mode_service, secrets_broker


def _load_vault():
    return {
        "credentials": [
            {
                "id": "cred-telegram",
                "provider": "telegram_bot",
                "label": "Telegram Bot",
                "workspace_id": "workspace-1",
                "encrypted_secret": json.dumps(
                    {
                        "chat_id": "chat-123",
                        "api_key": "telegram-secret",
                    }
                ),
                "metadata": {"bot_username": "@partspro_bot"},
                "updated_at": "2026-04-10T00:00:00Z",
            },
            {
                "id": "cred-openai",
                "provider": "openai",
                "label": "OpenAI Primary",
                "workspace_id": "workspace-1",
                "encrypted_secret": json.dumps(
                    {
                        "access_token": "openai-secret",
                        "org_id": "org-1",
                    }
                ),
                "metadata": {"model": "gpt-5.4"},
                "updated_at": "2026-04-10T00:00:00Z",
            },
        ]
    }


class SecretsBrokerTests(unittest.TestCase):
    def tearDown(self) -> None:
        safe_mode_service.reset_state_for_tests()

    def test_verify_secret_access_token_rejects_expired_grant(self):
        grant = secrets_broker.issue_connector_secret_grant(
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            credential_id="cred-telegram",
            connector_id="telegram_bot",
            ttl_seconds=1,
        )

        with self.assertRaises(secrets_broker.SecretAccessDeniedError) as raised:
            secrets_broker.verify_secret_access_token(
                grant.token,
                expected_secret_kind="connector_credential",
                expected_workspace_id="workspace-1",
                expected_credential_id="cred-telegram",
                now=grant.claims["expires_at"] + 1,
            )

        self.assertEqual(raised.exception.code, "token_expired")

    def test_resolve_connector_secret_projects_allowed_fields_and_keeps_metadata(self):
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-1"}),
        ) as audit_mock:
            secret = secrets_broker.resolve_connector_secret(
                _load_vault,
                lambda encrypted: encrypted,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                credential_id="cred-telegram",
                connector_id="telegram_bot",
                tool_name="send_message",
                action_id="send_message",
                allowed_fields=["chat_id"],
            )

        self.assertEqual(secret["chat_id"], "chat-123")
        self.assertNotIn("api_key", secret)
        self.assertEqual(secret["_provider"], "telegram_bot")
        self.assertEqual(secret["_label"], "Telegram Bot")
        self.assertTrue(audit_mock.called)

    def test_resolve_connector_secret_rejects_connector_mismatch_and_audits_denial(self):
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-2"}),
        ) as audit_mock:
            with self.assertRaises(secrets_broker.SecretAccessDeniedError) as raised:
                secrets_broker.resolve_connector_secret(
                    _load_vault,
                    lambda encrypted: encrypted,
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    credential_id="cred-telegram",
                    connector_id="google_workspace",
                    tool_name="send_email",
                )

        self.assertEqual(raised.exception.code, "connector_mismatch")
        self.assertTrue(audit_mock.called)
        self.assertEqual(audit_mock.await_args.kwargs["status"], "denied")

    def test_resolve_connector_secret_audits_connector_class_metadata(self):
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-class"}),
        ) as audit_mock:
            secret = secrets_broker.resolve_connector_secret(
                _load_vault,
                lambda encrypted: encrypted,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                credential_id="cred-telegram",
                connector_id="telegram_bot",
                connector_class="api_connector",
                tool_name="send_message",
                action_id="send_message",
                allowed_fields=["chat_id"],
            )

        self.assertEqual(secret["chat_id"], "chat-123")
        self.assertEqual(audit_mock.await_args.kwargs["metadata"]["connector_class"], "api_connector")

    def test_resolve_provider_secret_supports_default_provider_resolution(self):
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-3"}),
        ) as audit_mock:
            secret = secrets_broker.resolve_provider_secret(
                _load_vault,
                lambda encrypted: encrypted,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                provider_id="openai",
                tool_name="provider_inference",
                run_id="run-1",
            )

        self.assertEqual(secret["access_token"], "openai-secret")
        self.assertEqual(secret["_provider"], "openai")
        self.assertTrue(audit_mock.called)

    def test_resolve_provider_secret_prefers_workspace_scoped_credential(self):
        def _load_workspace_vault():
            return {
                "credentials": [
                    {
                        "id": "cred-openai-global",
                        "provider": "openai",
                        "label": "OpenAI Global",
                        "workspace_id": None,
                        "encrypted_secret": json.dumps({"access_token": "global-token"}),
                        "updated_at": "2026-04-01T00:00:00Z",
                    },
                    {
                        "id": "cred-openai-workspace",
                        "provider": "openai",
                        "label": "OpenAI Workspace",
                        "workspace_id": "workspace-2",
                        "encrypted_secret": json.dumps({"access_token": "workspace-token"}),
                        "updated_at": "2026-04-10T00:00:00Z",
                    },
                ]
            }

        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-3b"}),
        ):
            secret = secrets_broker.resolve_provider_secret(
                _load_workspace_vault,
                lambda encrypted: encrypted,
                tenant_id="tenant-1",
                workspace_id="workspace-2",
                provider_id="openai",
                tool_name="provider_inference",
            )

        self.assertEqual(secret["access_token"], "workspace-token")
        self.assertEqual(secret["_workspace_id"], "workspace-2")

    def test_resolve_connector_secret_rejects_revoked_credential(self):
        safe_mode_service.revoke_connector_access(
            workspace_id="workspace-1",
            connector_id="telegram_bot",
            credential_id="cred-telegram",
            reason="incident",
        )
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-4"}),
        ) as audit_mock:
            with self.assertRaises(secrets_broker.SecretAccessDeniedError) as raised:
                secrets_broker.resolve_connector_secret(
                    _load_vault,
                    lambda encrypted: encrypted,
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    credential_id="cred-telegram",
                    connector_id="telegram_bot",
                    tool_name="send_message",
                )

        self.assertEqual(raised.exception.code, "credential_rotation_required")
        self.assertEqual(audit_mock.await_args.kwargs["status"], "denied")

    def test_resolve_connector_secret_rejects_rotated_out_credential(self):
        safe_mode_service.rotate_connector_access(
            workspace_id="workspace-1",
            connector_id="telegram_bot",
            previous_credential_id="cred-telegram",
            replacement_credential_id="cred-telegram-new",
            reason="rotated",
        )
        with patch(
            "server_modules.secrets_broker.control_plane_repository.append_agent_secret_access_event",
            new=AsyncMock(return_value={"id": "sevt-5"}),
        ):
            with self.assertRaises(secrets_broker.SecretAccessDeniedError) as raised:
                secrets_broker.resolve_connector_secret(
                    _load_vault,
                    lambda encrypted: encrypted,
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    credential_id="cred-telegram",
                    connector_id="telegram_bot",
                    tool_name="send_message",
                )

        self.assertEqual(raised.exception.code, "credential_rotated")


if __name__ == "__main__":
    unittest.main()
