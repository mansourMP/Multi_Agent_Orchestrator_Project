from __future__ import annotations

import unittest
from unittest.mock import patch

from server_modules import provider_catalog_service
from server_modules import provider_profiles
from server_modules import usage_reporting


class ProviderProfilesTests(unittest.TestCase):
    def test_gemini_provider_defaults_to_25_flash_and_keeps_25_pro_available(self) -> None:
        gemini_entry = provider_profiles.provider_catalog_entry("gemini")
        model_ids = [item["id"] for item in provider_profiles.provider_model_catalog("gemini")]

        self.assertEqual(gemini_entry["default_model"], "gemini-2.5-flash")
        self.assertIn("gemini-2.5-flash", model_ids)
        self.assertIn("gemini-2.5-pro", model_ids)

    def test_gemini_25_model_catalog_uses_current_pricing_and_capabilities(self) -> None:
        models = {
            item["id"]: item
            for item in provider_profiles.provider_model_catalog("gemini")
        }

        self.assertAlmostEqual(models["gemini-2.5-flash"]["input_cost_per_1k_usd"], 0.0003, places=8)
        self.assertAlmostEqual(models["gemini-2.5-flash"]["output_cost_per_1k_usd"], 0.0025, places=8)
        self.assertTrue(models["gemini-2.5-flash"]["supports_reasoning"])
        self.assertAlmostEqual(models["gemini-2.5-pro"]["input_cost_per_1k_usd"], 0.00125, places=8)
        self.assertAlmostEqual(models["gemini-2.5-pro"]["output_cost_per_1k_usd"], 0.01, places=8)
        self.assertTrue(models["gemini-2.5-pro"]["supports_reasoning"])

    def test_usage_reporting_uses_current_gemini_25_flash_pricing(self) -> None:
        pricing = usage_reporting.lookup_model_pricing("gemini", "gemini-2.5-flash")
        cost = usage_reporting.estimate_cost_usd("gemini", "gemini-2.5-flash", 1_000_000, 1_000_000)

        self.assertIsNotNone(pricing)
        self.assertEqual(pricing["source"], "https://ai.google.dev/gemini-api/docs/pricing")
        self.assertAlmostEqual(float(pricing["input"]), 0.30, places=6)
        self.assertAlmostEqual(float(pricing["output"]), 2.50, places=6)
        self.assertAlmostEqual(float(cost or 0.0), 2.80, places=6)

    def test_deepseek_provider_cost_table_uses_non_zero_official_rates(self) -> None:
        rates = provider_profiles.PROVIDER_COST_PER_1K["deepseek"]

        self.assertAlmostEqual(rates["input"], 0.00028, places=8)
        self.assertAlmostEqual(rates["output"], 0.00042, places=8)

    def test_deepseek_governance_metadata_includes_privacy_and_jurisdiction(self) -> None:
        governance = provider_profiles.provider_governance_entry("deepseek")

        self.assertEqual(governance["jurisdiction"], "People's Republic of China")
        self.assertIn("privacy policy", governance["privacy_posture"].lower())
        self.assertIn("prc", governance["residency"].lower())
        self.assertIn("regulated buyers", governance["enterprise_risk_note"].lower())

    def test_deepseek_model_catalog_uses_non_zero_pricing(self) -> None:
        models = {
            item["id"]: item
            for item in provider_profiles.provider_model_catalog("deepseek")
        }

        self.assertAlmostEqual(models["deepseek-chat"]["input_cost_per_1k_usd"], 0.00028, places=8)
        self.assertAlmostEqual(models["deepseek-chat"]["output_cost_per_1k_usd"], 0.00042, places=8)
        self.assertAlmostEqual(models["deepseek-reasoner"]["input_cost_per_1k_usd"], 0.00028, places=8)
        self.assertAlmostEqual(models["deepseek-reasoner"]["output_cost_per_1k_usd"], 0.00042, places=8)

    def test_build_masked_usage_falls_back_to_deepseek_provider_rates(self) -> None:
        usage = provider_profiles.build_masked_usage(
            "deepseek",
            "unknown-deepseek-model",
            "a" * 4000,
            "b" * 4000,
        )

        self.assertAlmostEqual(float(usage["estimated_cost_usd"] or 0.0), 0.0007, places=6)
        self.assertEqual(usage["cost_band"], "< $0.001")

    def test_usage_reporting_uses_current_deepseek_pricing(self) -> None:
        pricing = usage_reporting.lookup_model_pricing("deepseek", "deepseek-chat")
        cost = usage_reporting.estimate_cost_usd("deepseek", "deepseek-chat", 1_000_000, 1_000_000)

        self.assertIsNotNone(pricing)
        self.assertEqual(pricing["source"], "https://api-docs.deepseek.com/quick_start/pricing/")
        self.assertAlmostEqual(float(pricing["input"]), 0.28, places=6)
        self.assertAlmostEqual(float(pricing["output"]), 0.42, places=6)
        self.assertAlmostEqual(float(cost or 0.0), 0.70, places=6)


class ProviderCatalogProjectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_catalog_projection_exposes_deepseek_governance_notes(self) -> None:
        runtime_truth = {
            "workspace_id": "ws-1",
            "summary": {"provider_total": 1},
            "providers": [
                {
                    "id": "deepseek",
                    "label": "DeepSeek",
                    "state": "configured",
                    "default_model": "deepseek-chat",
                }
            ],
        }

        with patch(
            "server_modules.provider_catalog_service.provider_profiles.build_provider_runtime_truth",
            return_value=runtime_truth,
        ):
            payload = await provider_catalog_service.list_workspace_provider_catalog(workspace_id="ws-1")

        deepseek = payload["providers"][0]
        self.assertEqual(deepseek["privacy_posture_summary"], deepseek["privacy_posture"])
        self.assertEqual(deepseek["residency_caveat"], deepseek["residency"])
        self.assertIn("enterprise_risk_note", deepseek)
        self.assertTrue(str(deepseek["enterprise_risk_note"]).strip())


if __name__ == "__main__":
    unittest.main()
