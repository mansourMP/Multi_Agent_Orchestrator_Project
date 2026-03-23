import unittest

from server_modules import connectors_core


class ConnectorsCoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_model_alias_catalog_returns_models_list(self):
        result = await connectors_core.get_model_alias_catalog()

        self.assertIn("models", result)
        self.assertIsInstance(result["models"], list)
        self.assertTrue(any(item.get("alias") == "gpt-4o-mini" for item in result["models"]))


if __name__ == "__main__":
    unittest.main()
