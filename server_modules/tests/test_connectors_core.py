import unittest

from server_modules import connectors_core


class ConnectorsCoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_providers_includes_openai_codex(self):
        result = await connectors_core.list_providers()

        providers = result.get("providers", [])
        provider_ids = {item.get("id") for item in providers}
        self.assertIn("openai-codex", provider_ids)
        self.assertNotIn("google_workspace", provider_ids)
        openai_item = next(item for item in providers if item.get("id") == "openai")
        self.assertEqual(openai_item.get("kind"), "provider")
        self.assertIn(openai_item.get("state"), {"active", "configured", "setup_required", "unavailable", "degraded"})
        self.assertEqual(openai_item.get("identity_owner"), "platform_account")
        self.assertIn(
            openai_item.get("connection_kind"),
            {"workspace_provider_connection", "machine_local_capability", "runtime_environment"},
        )
        self.assertIn(openai_item.get("connection_scope"), {"workspace", "machine", "runtime"})

    async def test_list_connectors_includes_alias_entries(self):
        result = await connectors_core.list_connectors()

        connectors = {item.get("id"): item for item in result.get("connectors", [])}
        self.assertEqual(connectors["gmail"]["parent"], "google_workspace")
        self.assertEqual(connectors["google_calendar"]["parent"], "google_workspace")
        self.assertEqual(connectors["google_drive"]["parent"], "google_workspace")
        self.assertEqual(connectors["outlook"]["parent"], "microsoft_365")
        self.assertEqual(connectors["outlook_calendar"]["parent"], "microsoft_365")

    async def test_get_model_alias_catalog_returns_models_list(self):
        result = await connectors_core.get_model_alias_catalog()

        self.assertIn("models", result)
        self.assertIsInstance(result["models"], list)
        self.assertTrue(any(item.get("alias") == "gpt-4o-mini" for item in result["models"]))


if __name__ == "__main__":
    unittest.main()
