import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from server_modules import model_router, provider_profiles


class CredentialResolutionTests(unittest.TestCase):
    def setUp(self):
        provider_profiles._init()
        self._profiles_tmpdir = tempfile.TemporaryDirectory()
        self._temp_profiles_path = Path(self._profiles_tmpdir.name) / "profiles.json"
        self._original_profiles_path = provider_profiles._server.ORION_PROVIDER_PROFILES_FILE
        provider_profiles._server.ORION_PROVIDER_PROFILES_FILE = self._temp_profiles_path
        provider_profiles._server.sync_acp_manager_paths(provider_profiles_path=self._temp_profiles_path)
        provider_profiles._server.ACP_MANAGER.reload_secondary_state()

    def tearDown(self):
        provider_profiles._server.ORION_PROVIDER_PROFILES_FILE = self._original_profiles_path
        provider_profiles._server.sync_acp_manager_paths(provider_profiles_path=self._original_profiles_path)
        provider_profiles._server.ACP_MANAGER.reload_secondary_state()
        self._profiles_tmpdir.cleanup()

    @staticmethod
    def _profile(
        *,
        profile_id: str,
        credential_id: str,
        priority: int,
        created_at: str,
        model: str,
        workspace_id: str = "ws-1",
    ):
        return {
            "id": profile_id,
            "provider": "openai",
            "workspace_id": workspace_id,
            "credential_id": credential_id,
            "priority": priority,
            "created_at": created_at,
            "enabled": True,
            "model": model,
        }

    @patch("server_modules.provider_profiles._openai_env_bearer_with_source")
    @patch("server_modules.provider_profiles.resolve_default_vault_credential")
    @patch("server_modules.provider_profiles.resolve_vault_credential")
    def test_build_candidates_orders_explicit_then_selected_profile_then_fallbacks(
        self,
        resolve_vault_credential_mock,
        resolve_default_vault_credential_mock,
        env_bearer_mock,
    ):
        resolve_vault_credential_mock.side_effect = (
            lambda credential_id, workspace_id=None: {"access_token": f"token-{credential_id}", "workspace_id": workspace_id}
        )
        resolve_default_vault_credential_mock.return_value = {"access_token": "token-vault-default"}
        env_bearer_mock.return_value = ("token-env", "OPENAI_API_KEY")

        profiles = {
            "profile-low-priority": self._profile(
                profile_id="profile-low-priority",
                credential_id="cred-low",
                priority=1,
                created_at="2026-03-20T00:00:00Z",
                model="gpt-4.1-mini",
            ),
            "profile-selected": self._profile(
                profile_id="profile-selected",
                credential_id="cred-selected",
                priority=50,
                created_at="2026-03-22T00:00:00Z",
                model="gpt-4.1",
            ),
        }

        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, profiles, clear=True):
            candidates = provider_profiles._build_provider_credential_candidates(
                {"workspace_id": "ws-1", "credential_id": "cred-explicit"},
                {"profile_id": "profile-selected"},
                "openai",
            )

        self.assertEqual(
            [candidate["label"] for candidate in candidates],
            [
                "credential:cred-explicit",
                "profile:profile-selected",
                "profile:profile-low-priority",
                "vault-default",
                "env-openai",
            ],
        )
        self.assertEqual(candidates[0]["credentials"]["access_token"], "token-cred-explicit")
        self.assertEqual(candidates[1]["credentials"]["access_token"], "token-cred-selected")
        self.assertEqual(candidates[2]["credentials"]["access_token"], "token-cred-low")
        self.assertEqual(candidates[3]["credentials"]["access_token"], "token-vault-default")
        self.assertEqual(candidates[4]["credentials"]["access_token"], "token-env")

    @patch("server_modules.provider_profiles._openai_env_bearer_with_source")
    @patch("server_modules.provider_profiles.resolve_default_vault_credential")
    @patch("server_modules.provider_profiles.resolve_vault_credential")
    def test_resolve_call_credentials_prefers_selected_profile_model_and_credentials(
        self,
        resolve_vault_credential_mock,
        resolve_default_vault_credential_mock,
        env_bearer_mock,
    ):
        resolve_vault_credential_mock.side_effect = (
            lambda credential_id, workspace_id=None: {"access_token": f"token-{credential_id}", "workspace_id": workspace_id}
        )
        resolve_default_vault_credential_mock.return_value = {"access_token": "token-vault-default"}
        env_bearer_mock.return_value = ("token-env", "OPENAI_API_KEY")

        profiles = {
            "profile-default": self._profile(
                profile_id="profile-default",
                credential_id="cred-default",
                priority=1,
                created_at="2026-03-20T00:00:00Z",
                model="gpt-4.1-mini",
            ),
            "profile-selected": self._profile(
                profile_id="profile-selected",
                credential_id="cred-selected",
                priority=20,
                created_at="2026-03-22T00:00:00Z",
                model="gpt-4.1",
            ),
        }

        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, profiles, clear=True):
            resolution = model_router.resolve_call_credentials(
                provider="openai",
                workspace_id="ws-1",
                profile_id="profile-selected",
            )

        self.assertEqual(resolution["provider"], "openai")
        self.assertEqual(resolution["model"], "gpt-4.1")
        self.assertEqual(resolution["credentials"]["access_token"], "token-cred-selected")
        self.assertEqual(resolution["candidate"]["label"], "profile:profile-selected")

    @patch("server_modules.provider_profiles._openai_env_bearer_with_source")
    @patch("server_modules.provider_profiles.resolve_default_vault_credential")
    @patch("server_modules.provider_profiles.resolve_vault_credential")
    def test_resolve_call_credentials_falls_back_to_vault_default_before_env(
        self,
        resolve_vault_credential_mock,
        resolve_default_vault_credential_mock,
        env_bearer_mock,
    ):
        resolve_vault_credential_mock.side_effect = AssertionError("No explicit credential should be resolved.")
        resolve_default_vault_credential_mock.return_value = {"access_token": "token-vault-default"}
        env_bearer_mock.return_value = ("token-env", "OPENAI_API_KEY")

        with patch.dict(provider_profiles._server.PROVIDER_PROFILES, {}, clear=True):
            resolution = model_router.resolve_call_credentials(
                provider="openai",
                workspace_id="ws-1",
            )

        self.assertEqual(resolution["candidate"]["label"], "vault-default")
        self.assertEqual(resolution["credentials"]["access_token"], "token-vault-default")
        self.assertEqual(
            resolution["model"],
            str(provider_profiles.PROVIDER_CATALOG["openai"]["default_model"]),
        )


if __name__ == "__main__":
    unittest.main()
