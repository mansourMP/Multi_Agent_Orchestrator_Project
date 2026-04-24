from __future__ import annotations

import unittest
from unittest.mock import patch

from server_modules import provider_catalog_service


class ProviderCatalogServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_workspace_provider_catalog_exposes_models_and_governance(self) -> None:
        connection_truth = {
            "workspace_id": "ws-1",
            "summary": {"provider_total": 2},
            "providers": [
                {
                    "id": "openai",
                    "label": "OpenAI",
                    "state": "active",
                    "default_model": "gpt-4o",
                    "profile_metadata": {
                        "cached_models": ["gpt-live-new"],
                        "cached_models_synced_at": "2099-01-01T00:00:00Z",
                    },
                },
                {
                    "id": "deepseek",
                    "label": "DeepSeek",
                    "state": "configured",
                    "default_model": "deepseek-chat",
                },
            ],
        }
        runtime_truth = {
            "workspace_id": "ws-1",
            "summary": {"provider_total": 2, "active": 2, "configured": 0, "setup_required": 0, "unavailable": 0, "degraded": 0},
            "providers": [
                {
                    "id": "openai",
                    "label": "OpenAI",
                    "state": "active",
                    "usable": True,
                    "configured": True,
                    "active": True,
                    "credential_sources": ["env_api_key"],
                    "active_source": "env_api_key",
                    "identity_owner": "platform_account",
                    "identity_owner_label": "Empyralis account",
                    "identity_boundary_note": "Platform sign-in stays separate from provider capabilities and machine-local sessions.",
                    "machine_bound": False,
                },
                {
                    "id": "deepseek",
                    "label": "DeepSeek",
                    "state": "active",
                    "usable": True,
                    "configured": True,
                    "active": True,
                    "credential_sources": ["env-deepseek"],
                    "active_source": "env-deepseek",
                    "identity_owner": "platform_account",
                    "identity_owner_label": "Empyralis account",
                    "identity_boundary_note": "Platform sign-in stays separate from provider capabilities and machine-local sessions.",
                    "machine_bound": False,
                },
            ],
        }

        with patch(
            "server_modules.provider_catalog_service.provider_profiles.build_workspace_provider_connection_truth",
            return_value=connection_truth,
        ), patch(
            "server_modules.provider_catalog_service.provider_profiles.build_provider_runtime_truth",
            return_value=runtime_truth,
        ):
            payload = await provider_catalog_service.list_workspace_provider_catalog(workspace_id="ws-1")

        self.assertEqual(payload["workspace_id"], "ws-1")
        self.assertEqual(payload["summary"]["provider_total"], 2)
        providers = {item["id"]: item for item in payload["providers"]}
        self.assertIn("privacy_posture", providers["openai"])
        self.assertIn("jurisdiction", providers["openai"])
        self.assertTrue(any(model["id"] == "gpt-live-new" for model in providers["openai"]["models"]))
        self.assertEqual(providers["openai"]["models_source"], "workspace_cached_models")
        self.assertTrue(any(model["id"] == "deepseek-chat" for model in providers["deepseek"]["models"]))
        self.assertEqual(providers["deepseek"]["state"], "active")
        self.assertEqual(providers["deepseek"]["active_source"], "env-deepseek")

    def test_openai_codex_catalog_exposes_reasoning_levels(self) -> None:
        models = provider_catalog_service.provider_profiles.provider_model_catalog("openai-codex")
        gpt_54 = next((item for item in models if item.get("id") == "gpt-5.4"), None)

        self.assertIsNotNone(gpt_54)
        self.assertEqual(gpt_54["reasoning_levels"], ["low", "medium", "high", "xhigh"])

    def test_resolve_provider_model_selection_defaults_model_for_provider(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(provider="openai", model=None)

        self.assertEqual(selection, {"provider": "openai", "model": "gpt-4o"})

    def test_resolve_provider_model_selection_defaults_to_gemini_25_flash(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(provider="gemini", model=None)

        self.assertEqual(selection, {"provider": "gemini", "model": "gemini-2.5-flash"})

    def test_resolve_provider_model_selection_defaults_to_live_anthropic_model(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(provider="anthropic", model=None)

        self.assertEqual(selection, {"provider": "anthropic", "model": "claude-3-7-sonnet-20250219"})

    def test_resolve_provider_model_selection_normalizes_prefixed_model_ids(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(
            provider="anthropic",
            model="anthropic/claude-3-5-sonnet-20241022",
        )

        self.assertEqual(selection, {"provider": "anthropic", "model": "claude-3-5-sonnet-20241022"})

    def test_resolve_provider_model_selection_accepts_cached_live_model_ids(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(
            provider="anthropic",
            model="claude-sonnet-4-6",
            cached_models=["claude-sonnet-4-6", "claude-opus-4-1"],
        )

        self.assertEqual(selection, {"provider": "anthropic", "model": "claude-sonnet-4-6"})

    def test_cached_provider_model_ids_reads_workspace_profile_metadata(self) -> None:
        connection_truth = {
            "workspace_id": "ws-1",
            "providers": [
                {
                    "id": "openai",
                    "profile_metadata": {
                        "cached_models": ["gpt-live-new"],
                    },
                },
            ],
        }
        with patch(
            "server_modules.provider_catalog_service.provider_profiles.build_workspace_provider_connection_truth",
            return_value=connection_truth,
        ):
            models = provider_catalog_service.cached_provider_model_ids(
                workspace_id="ws-1",
                provider="openai",
            )

        self.assertEqual(models, ["gpt-live-new"])

    def test_provider_profiles_normalize_anthropic_latest_alias_to_live_model(self) -> None:
        normalized = provider_catalog_service.provider_profiles.normalize_provider_model_id(
            "anthropic",
            "claude-3-7-sonnet-latest",
            fallback_to_default=True,
        )

        self.assertEqual(normalized, "claude-3-7-sonnet-20250219")

    def test_resolve_provider_model_selection_rejects_unknown_models(self) -> None:
        with self.assertRaisesRegex(ValueError, "not supported"):
            provider_catalog_service.resolve_provider_model_selection(
                provider="deepseek",
                model="gpt-4o",
            )


if __name__ == "__main__":
    unittest.main()
