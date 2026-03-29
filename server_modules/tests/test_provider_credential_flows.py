import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from server_modules import connectors_actions, provider_profiles
from server_modules.runtime_models import CredentialUpsertRequest, configure_runtime_model_context


class ProviderValidationMessageTests(unittest.TestCase):
    def setUp(self):
        provider_profiles._init()

    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_oauth_token_validate_skips_standard_api_probe(self, http_json_request_mock):
        result = provider_profiles.OpenAIAdapter().validate(
            {"oauth_token": "token-123", "auth_mode": "oauth_token"}
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], 200)
        self.assertIn("imported", result["message"].lower())
        http_json_request_mock.assert_not_called()

    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_oauth_token_list_models_returns_codex_catalog_without_probe(self, http_json_request_mock):
        models = provider_profiles.OpenAIAdapter().list_models(
            {"oauth_token": "token-123", "auth_mode": "oauth_token"}
        )

        self.assertEqual(models, provider_profiles.OPENAI_CODEX_MODEL_CATALOG)
        http_json_request_mock.assert_not_called()

    @patch("server_modules.provider_profiles._openai_bearer_from_credentials", return_value="token-123")
    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_validate_returns_real_error_message_on_non_200_for_standard_api_tokens(
        self,
        http_json_request_mock,
        _openai_bearer_mock,
    ):
        http_json_request_mock.return_value = {
            "status": 429,
            "json": {"error": {"message": "Rate limit exceeded for this token."}},
            "text": '{"error":{"message":"Rate limit exceeded for this token."}}',
        }

        result = provider_profiles.OpenAIAdapter().validate({"access_token": "token-123", "auth_mode": "access_token"})

        self.assertEqual(result["status"], 429)
        self.assertFalse(result["ok"])
        self.assertIn("Rate limit exceeded", result["message"])


class CredentialVaultFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        provider_profiles._init()
        configure_runtime_model_context(
            memory_max_text_chars=2400,
            normalize_memory_bucket=lambda value, required=True: value,
            normalize_action_id=lambda value: str(value or "").strip().lower(),
            provider_catalog=provider_profiles.PROVIDER_CATALOG,
            connector_catalog={},
        )

    @patch("server_modules.connectors_actions.save_vault")
    @patch("server_modules.connectors_actions.load_vault", return_value={})
    @patch("server_modules.connectors_actions._openssl_encrypt", return_value="encrypted-payload")
    @patch("server_modules.connectors_actions._provider_public_metadata", return_value={"auth_mode": "oauth_token"})
    @patch("server_modules.connectors_actions.resolve_provider_adapter", side_effect=AssertionError("validation should be skipped"))
    async def test_create_vault_credential_can_skip_validation(
        self,
        _resolve_provider_adapter_mock,
        _provider_public_metadata_mock,
        _openssl_encrypt_mock,
        load_vault_mock,
        save_vault_mock,
    ):
        body = CredentialUpsertRequest(
            label="OpenAI / Codex on this Mac",
            provider="openai",
            workspace_id="default",
            mode="byok",
            credentials={"oauth_token": "token-123", "auth_mode": "oauth_token"},
            metadata={"import_source": "codex_auth_file"},
            skip_validation=True,
        )

        result = await connectors_actions.create_vault_credential(body)

        self.assertEqual(result["provider"], "openai")
        self.assertEqual(result["models_preview"], [])
        saved_vault = save_vault_mock.call_args.args[0]
        self.assertEqual(len(saved_vault["credentials"]), 1)
        self.assertEqual(saved_vault["credentials"][0]["metadata"]["import_source"], "codex_auth_file")
        load_vault_mock.assert_called_once()

    @patch("server_modules.connectors_actions.resolve_vault_credential", return_value={"_provider": "openai", "oauth_token": "token-123"})
    @patch("server_modules.connectors_actions.resolve_provider_adapter")
    async def test_test_vault_credential_does_not_list_models_when_validation_fails(
        self,
        resolve_provider_adapter_mock,
        _resolve_vault_credential_mock,
    ):
        adapter = MagicMock()
        adapter.validate.return_value = {
            "ok": False,
            "status": 429,
            "message": "Rate limit exceeded for this token.",
        }
        adapter.list_models.side_effect = AssertionError("model listing should not run when validation fails")
        resolve_provider_adapter_mock.return_value = ("openai", {}, adapter)

        result = await connectors_actions.test_vault_credential("cred-123", workspace_id="default")

        self.assertEqual(result["provider"], "openai")
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 429)
        self.assertEqual(result["models_preview"], [])
        adapter.list_models.assert_not_called()

    @patch("server_modules.connectors_actions.save_vault")
    @patch(
        "server_modules.connectors_actions.load_vault",
        return_value={
            "credentials": [
                {
                    "id": "connector-google",
                    "label": "Google Workspace",
                    "provider": "google_workspace",
                    "workspace_id": "default",
                    "metadata": {},
                }
            ]
        },
    )
    @patch(
        "server_modules.connectors_actions.resolve_vault_credential",
        return_value={"_provider": "google_workspace"},
    )
    @patch(
        "server_modules.connectors_actions.validate_google_workspace_connector",
        side_effect=RuntimeError("Google Workspace CLI token is not valid."),
    )
    async def test_test_connector_vault_persists_failed_google_verification_as_unusable(
        self,
        _validate_google_workspace_mock,
        _resolve_vault_credential_mock,
        _load_vault_mock,
        save_vault_mock,
    ):
        with self.assertRaises(HTTPException) as excinfo:
            await connectors_actions.test_connector_vault("connector-google", workspace_id="default")

        self.assertEqual(excinfo.exception.status_code, 400)
        saved_vault = save_vault_mock.call_args.args[0]
        saved_entry = saved_vault["credentials"][0]
        verification = saved_entry["metadata"]["capability_verification"]
        self.assertFalse(verification["authenticated"])
        self.assertFalse(verification["runtime_usable"])
        self.assertEqual(verification["write_actions"], [])


if __name__ == "__main__":
    unittest.main()
