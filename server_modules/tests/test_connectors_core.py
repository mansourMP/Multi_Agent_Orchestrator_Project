import unittest

from server_modules import connectors_core


class ConnectorsCoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_providers_includes_openai_codex(self):
        result = await connectors_core.list_providers()

        provider_ids = {item.get("id") for item in result.get("providers", [])}
        self.assertIn("openai-codex", provider_ids)

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
