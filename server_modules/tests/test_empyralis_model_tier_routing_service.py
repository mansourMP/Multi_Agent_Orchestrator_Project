from __future__ import annotations

import unittest

from server_modules import empyralis_model_tier_routing_service, provider_profiles


class EmpyralisModelTierRoutingServiceTests(unittest.TestCase):
    def test_public_route_hides_internal_provider_and_model(self) -> None:
        route = empyralis_model_tier_routing_service.resolve_model_tier_route("pro")

        self.assertEqual(route["public_tier"], "pro")
        self.assertEqual(route["public_label"], "Pro")
        self.assertIsNone(route["internal_provider"])
        self.assertIsNone(route["internal_model"])
        self.assertIsNone(route["admin_debug"])
        self.assertFalse(route["expose_provider_model_to_ordinary_ui"])

    def test_admin_route_exposes_backend_provider_and_fallback(self) -> None:
        route = empyralis_model_tier_routing_service.resolve_model_tier_route(
            "max",
            include_internal_route=True,
        )

        self.assertEqual(route["internal_provider"], "deepseek")
        self.assertEqual(route["internal_model"], "deepseek-v4-pro")
        self.assertEqual(route["admin_debug"]["fallback_provider"], "deepseek")
        self.assertEqual(route["admin_debug"]["fallback_model"], "deepseek-v4-pro")
        self.assertEqual(route["fallback"]["public_tier"], "pro")

    def test_backend_provider_model_routes_are_real_catalog_entries(self) -> None:
        pro_route = empyralis_model_tier_routing_service.resolve_backend_provider_model_for_tier("pro")
        max_route = empyralis_model_tier_routing_service.resolve_backend_provider_model_for_tier("max")
        deepseek_models = {
            item["id"]: item
            for item in provider_profiles.provider_model_catalog("deepseek")
        }

        self.assertEqual(pro_route["provider"], "deepseek")
        self.assertEqual(pro_route["model"], "deepseek-v4-pro")
        self.assertEqual(pro_route["reasoning_effort"], "high")
        self.assertEqual(max_route["model"], "deepseek-v4-pro")
        self.assertEqual(max_route["reasoning_effort"], "max")
        self.assertGreater(max_route["credit_multiplier"], pro_route["credit_multiplier"])
        self.assertIn("deepseek-v4-flash", deepseek_models)
        self.assertIn("deepseek-v4-pro", deepseek_models)
        self.assertEqual(deepseek_models["deepseek-v4-flash"]["context_window_tokens"], 1000000)
        self.assertEqual(deepseek_models["deepseek-v4-pro"]["context_window_tokens"], 1000000)
        self.assertTrue(deepseek_models["deepseek-v4-pro"]["supports_reasoning"])
        self.assertEqual(deepseek_models["deepseek-v4-pro"]["reasoning_levels"], ["high", "max"])

    def test_requested_tier_resolves_without_exposing_raw_route_to_ui(self) -> None:
        route = empyralis_model_tier_routing_service.resolve_requested_empyralis_tier(
            requested_provider="empyralis",
            requested_model="pro",
        )

        self.assertIsNotNone(route)
        self.assertEqual(route["provider"], "deepseek")
        self.assertEqual(route["model"], "deepseek-v4-pro")
        self.assertEqual(route["public_tier"], "pro")

    def test_fallback_route_keeps_public_tier_stable(self) -> None:
        route = empyralis_model_tier_routing_service.resolve_model_tier_route(
            "max",
            include_internal_route=True,
        )

        self.assertEqual(route["public_tier"], "max")
        self.assertEqual(route["public_label"], "Max")
        self.assertIsNotNone(route["fallback"])
        self.assertEqual(route["fallback"]["public_tier"], "pro")
        self.assertEqual(route["fallback"]["public_label"], "Pro")

    def test_legacy_deepseek_default_migrates_to_pro(self) -> None:
        tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider="deepseek",
            requested_model="deepseek-chat",
        )

        self.assertEqual(tier, "pro")

    def test_legacy_fast_route_migrates_to_light(self) -> None:
        tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider="deepseek",
            requested_model="deepseek-v4-flash",
        )

        self.assertEqual(tier, "light")

    def test_legacy_high_end_route_migrates_to_max(self) -> None:
        tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider="deepseek",
            requested_model="deepseek-reasoner",
        )

        self.assertEqual(tier, "max")

    def test_legacy_ollama_route_migrates_to_local_ai(self) -> None:
        tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider="ollama",
            requested_model="llama3.2",
        )

        self.assertEqual(tier, "local_ai")

    def test_workspace_byok_route_migrates_to_my_api_key(self) -> None:
        tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider="openai",
            requested_model="gpt-4o",
            metadata={"credential_owner_kind": "workspace_byok"},
        )

        self.assertEqual(tier, "my_api_key")


if __name__ == "__main__":
    unittest.main()
