import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from server_modules import connectors_actions, provider_profiles
from server_modules.runtime_models import CredentialUpsertRequest, configure_runtime_model_context


class ProviderValidationMessageTests(unittest.TestCase):
    def setUp(self):
        provider_profiles._init()

    def test_classify_profile_failure_marks_rate_limits_as_retryable_backpressure(self):
        result = provider_profiles.classify_profile_failure("429 Rate limit exceeded for this token.")

        self.assertEqual(result["failure_class"], "rate_limited")
        self.assertTrue(result["retryable"])
        self.assertTrue(result["backpressure"])
        self.assertGreaterEqual(result["cooldown_seconds"], 30)

    def test_classify_profile_failure_marks_auth_errors_as_non_retryable(self):
        result = provider_profiles.classify_profile_failure("401 Unauthorized API key.")

        self.assertEqual(result["failure_class"], "auth")
        self.assertFalse(result["retryable"])
        self.assertFalse(result["backpressure"])
        self.assertGreaterEqual(result["cooldown_seconds"], 60)

    def test_resolve_provider_adapter_keeps_openai_direct_for_codex_token_credentials(self):
        resolved_provider, adapter_key, adapter = provider_profiles.resolve_provider_adapter(
            "openai",
            {"oauth_token": "token-123", "account_id": "acct-123", "credential_type": "codex_token"},
        )

        self.assertEqual(resolved_provider, "openai")
        self.assertEqual(adapter_key, "openai")
        self.assertIsInstance(adapter, provider_profiles.OpenAIAdapter)

    def test_resolve_provider_adapter_uses_codex_transport_when_explicitly_selected(self):
        resolved_provider, adapter_key, adapter = provider_profiles.resolve_provider_adapter(
            "openai-codex",
            {"oauth_token": "token-123", "account_id": "acct-123", "credential_type": "codex_token"},
        )

        self.assertEqual(resolved_provider, "openai-codex")
        self.assertEqual(adapter_key, "openai-codex")
        self.assertIsInstance(adapter, provider_profiles.OpenAICodexAdapter)

    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_oauth_token_validate_uses_standard_api_probe(self, http_json_request_mock):
        http_json_request_mock.return_value = {
            "status": 200,
            "json": {"data": []},
            "text": "",
        }
        result = provider_profiles.OpenAIAdapter().validate(
            {"oauth_token": "token-123", "auth_mode": "oauth_token"}
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], 200)
        self.assertIn("valid", result["message"].lower())
        http_json_request_mock.assert_called_once()

    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_codex_list_models_returns_codex_catalog_without_probe(self, http_json_request_mock):
        models = provider_profiles.OpenAICodexAdapter().list_models(
            {"oauth_token": "token-123", "account_id": "acct-123", "credential_type": "codex_token"}
        )

        self.assertEqual(models, provider_profiles.OPENAI_CODEX_MODEL_CATALOG)
        http_json_request_mock.assert_not_called()

    @patch("server_modules.provider_profiles.http_json_request")
    def test_openai_oauth_token_list_models_uses_standard_api_catalog(self, http_json_request_mock):
        http_json_request_mock.return_value = {
            "status": 200,
            "json": {
                "data": [
                    {"id": "gpt-4o"},
                    {"id": "gpt-4o-mini"},
                ]
            },
            "text": "",
        }
        models = provider_profiles.OpenAIAdapter().list_models(
            {"oauth_token": "token-123", "auth_mode": "oauth_token"}
        )

        self.assertEqual(models, ["gpt-4o", "gpt-4o-mini"])
        http_json_request_mock.assert_called_once()

    @patch("server_modules.provider_profiles.http_json_request")
    def test_anthropic_validate_uses_models_endpoint(self, http_json_request_mock):
        http_json_request_mock.return_value = {
            "status": 200,
            "json": {"data": [{"id": "claude-3-7-sonnet-latest"}]},
            "text": "",
        }

        result = provider_profiles.AnthropicAdapter().validate({"api_key": "test-key"})

        self.assertTrue(result["ok"])
        args, kwargs = http_json_request_mock.call_args
        self.assertEqual(args[0], "https://api.anthropic.com/v1/models")
        self.assertNotIn("payload", kwargs)

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

    @patch("server_modules.provider_profiles._load_openai_codex_transport")
    def test_openai_codex_generate_uses_codex_transport(self, load_transport_mock):
        worker_llm = MagicMock()
        worker_llm.openai_codex_backend_text.return_value = ("READY", {"prompt_tokens": 1}, "gpt-5.4", "")
        load_transport_mock.return_value = worker_llm

        result = provider_profiles.OpenAICodexAdapter().generate(
            "system",
            "user",
            "gpt-5.4",
            {"oauth_token": "token-123", "account_id": "acct-123", "credential_type": "codex_token"},
        )

        self.assertEqual(result, "READY")
        worker_llm.openai_codex_backend_text.assert_called_once()


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
