import unittest
from unittest.mock import patch

from server_modules import provider_profiles


class ProviderCatalogTruthTests(unittest.TestCase):
    def setUp(self) -> None:
        provider_profiles._init()

    @patch("server_modules.provider_profiles.resolve_default_vault_credential", side_effect=RuntimeError("missing"))
    @patch("server_modules.provider_profiles.gemini_cli_available", return_value=False)
    @patch(
        "server_modules.provider_profiles.claude_code_cli_status",
        return_value={"available": False, "logged_in": False, "message": "Claude Code CLI is not installed."},
    )
    @patch("server_modules.provider_profiles._openai_env_bearer_with_source", return_value=("codex-token", "env_codex_oauth_token"))
    def test_codex_token_does_not_claim_direct_openai_is_ready(
        self,
        _openai_env_mock,
        _claude_status_mock,
        _gemini_cli_mock,
        _resolve_default_mock,
    ) -> None:
        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {}, clear=True):
            payload = provider_profiles.build_provider_runtime_truth("default")

        providers = payload["providers_by_id"]
        self.assertEqual(providers["openai"]["state"], "setup_required")
        self.assertEqual(providers["openai"]["issue_code"], "direct_openai_credential_required")
        self.assertEqual(providers["openai-codex"]["state"], "active")

    @patch("server_modules.provider_profiles.resolve_default_vault_credential", side_effect=RuntimeError("missing"))
    @patch("server_modules.provider_profiles.gemini_cli_available", return_value=False)
    @patch("server_modules.provider_profiles._openai_env_bearer_with_source", return_value=("", ""))
    @patch(
        "server_modules.provider_profiles.claude_code_cli_status",
        return_value={"available": False, "logged_in": False, "message": "Claude Code CLI is not installed."},
    )
    def test_anthropic_local_cli_profile_is_unavailable_when_cli_missing(
        self,
        _claude_status_mock,
        _openai_env_mock,
        _gemini_cli_mock,
        _resolve_default_mock,
    ) -> None:
        profile = {
            "id": "profile-anthropic-local",
            "provider": "anthropic",
            "label": "Claude Subscription",
            "auth_mode": "local_cli",
            "workspace_id": "default",
            "enabled": True,
            "cooldown_until": None,
            "last_error": None,
        }
        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {"profile-anthropic-local": profile}, clear=True):
            payload = provider_profiles.build_provider_runtime_truth("default")

        anthropic = payload["providers_by_id"]["anthropic"]
        self.assertEqual(anthropic["state"], "unavailable")
        self.assertEqual(anthropic["issue_code"], "local_cli_missing")
        self.assertEqual(anthropic["connection_kind"], "machine_local_capability")
        self.assertEqual(anthropic["connection_scope"], "machine")
        self.assertEqual(anthropic["connection_label"], "This machine only")

    @patch("server_modules.provider_profiles.resolve_default_vault_credential", side_effect=RuntimeError("missing"))
    @patch("server_modules.provider_profiles._openai_env_bearer_with_source", return_value=("", ""))
    @patch(
        "server_modules.provider_profiles.claude_code_cli_status",
        return_value={"available": False, "logged_in": False, "message": "Claude Code CLI is not installed."},
    )
    @patch("server_modules.provider_profiles.gemini_cli_available", return_value=True)
    def test_gemini_cli_presence_alone_is_setup_required_not_active(
        self,
        _gemini_cli_mock,
        _claude_status_mock,
        _openai_env_mock,
        _resolve_default_mock,
    ) -> None:
        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {}, clear=True):
            payload = provider_profiles.build_provider_runtime_truth("default")

        gemini = payload["providers_by_id"]["gemini"]
        self.assertEqual(gemini["state"], "setup_required")
        self.assertEqual(gemini["issue_code"], "gemini_cli_oauth_incomplete")
        self.assertFalse(gemini["active"])

    @patch("server_modules.provider_profiles.resolve_default_vault_credential", side_effect=RuntimeError("missing"))
    @patch("server_modules.provider_profiles.gemini_cli_available", return_value=False)
    @patch(
        "server_modules.provider_profiles.claude_code_cli_status",
        return_value={"available": False, "logged_in": False, "message": "Claude Code CLI is not installed."},
    )
    @patch("server_modules.provider_profiles._openai_env_bearer_with_source", return_value=("", ""))
    def test_rate_limited_profile_projects_degraded_provider_state(
        self,
        _openai_env_mock,
        _claude_status_mock,
        _gemini_cli_mock,
        _resolve_default_mock,
    ) -> None:
        profile = {
            "id": "profile-openai-rate-limit",
            "provider": "openai",
            "label": "OpenAI Direct",
            "auth_mode": "api_key",
            "workspace_id": "default",
            "enabled": True,
            "cooldown_until": "2099-01-01T00:00:30Z",
            "last_error": "429 Rate limit exceeded.",
            "last_failure_at": "2099-01-01T00:00:00Z",
            "last_success_at": None,
        }
        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {"profile-openai-rate-limit": profile}, clear=True):
            payload = provider_profiles.build_provider_runtime_truth("default")

        openai = payload["providers_by_id"]["openai"]
        self.assertEqual(openai["state"], "degraded")
        self.assertTrue(openai["backpressure"])
        self.assertEqual(openai["failure_class"], "rate_limited")
        self.assertEqual(openai["connection_kind"], "workspace_provider_connection")
        self.assertEqual(openai["connection_scope"], "workspace")
        self.assertEqual(openai["connection_label"], "Workspace provider")
        self.assertIsInstance(openai["retry_after_seconds"], int)
        self.assertGreaterEqual(openai["retry_after_seconds"], 0)

    @patch("server_modules.provider_profiles.resolve_default_vault_credential", side_effect=RuntimeError("missing"))
    @patch("server_modules.provider_profiles.gemini_cli_available", return_value=False)
    @patch(
        "server_modules.provider_profiles.claude_code_cli_status",
        return_value={"available": False, "logged_in": False, "message": "Claude Code CLI is not installed."},
    )
    @patch("server_modules.provider_profiles._openai_env_bearer_with_source", return_value=("sk-live", "env_api_key"))
    def test_openai_env_api_key_is_runtime_environment_not_identity(
        self,
        _openai_env_mock,
        _claude_status_mock,
        _gemini_cli_mock,
        _resolve_default_mock,
    ) -> None:
        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {}, clear=True):
            payload = provider_profiles.build_provider_runtime_truth("default")

        openai = payload["providers_by_id"]["openai"]
        self.assertEqual(openai["state"], "active")
        self.assertEqual(openai["connection_kind"], "runtime_environment")
        self.assertEqual(openai["connection_scope"], "runtime")
        self.assertEqual(openai["connection_label"], "Runtime environment")
        self.assertEqual(openai["identity_owner"], "platform_account")
        self.assertEqual(openai["identity_owner_label"], "Empyralis account")


if __name__ == "__main__":
    unittest.main()
