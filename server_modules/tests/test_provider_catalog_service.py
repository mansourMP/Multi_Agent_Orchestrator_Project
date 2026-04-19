from __future__ import annotations

import unittest
from unittest.mock import patch

from server_modules import provider_catalog_service


class ProviderCatalogServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_workspace_provider_catalog_exposes_models_and_governance(self) -> None:
        runtime_truth = {
            "workspace_id": "ws-1",
            "summary": {"provider_total": 2},
            "providers": [
                {
                    "id": "openai",
                    "label": "OpenAI",
                    "state": "active",
                    "default_model": "gpt-4o",
                },
                {
                    "id": "deepseek",
                    "label": "DeepSeek",
                    "state": "configured",
                    "default_model": "deepseek-chat",
                },
            ],
        }

        with patch(
            "server_modules.provider_catalog_service.provider_profiles.build_provider_runtime_truth",
            return_value=runtime_truth,
        ):
            payload = await provider_catalog_service.list_workspace_provider_catalog(workspace_id="ws-1")

        self.assertEqual(payload["workspace_id"], "ws-1")
        self.assertEqual(payload["summary"]["provider_total"], 2)
        providers = {item["id"]: item for item in payload["providers"]}
        self.assertIn("privacy_posture", providers["openai"])
        self.assertIn("jurisdiction", providers["openai"])
        self.assertTrue(any(model["id"] == "gpt-4o" for model in providers["openai"]["models"]))
        self.assertTrue(any(model["id"] == "deepseek-chat" for model in providers["deepseek"]["models"]))

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

    def test_resolve_provider_model_selection_normalizes_prefixed_model_ids(self) -> None:
        selection = provider_catalog_service.resolve_provider_model_selection(
            provider="anthropic",
            model="anthropic/claude-3-5-sonnet-20241022",
        )

        self.assertEqual(selection, {"provider": "anthropic", "model": "claude-3-5-sonnet-20241022"})

    def test_resolve_provider_model_selection_rejects_unknown_models(self) -> None:
        with self.assertRaisesRegex(ValueError, "not supported"):
            provider_catalog_service.resolve_provider_model_selection(
                provider="deepseek",
                model="gpt-4o",
            )


if __name__ == "__main__":
    unittest.main()
