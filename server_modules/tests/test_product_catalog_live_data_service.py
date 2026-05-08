from __future__ import annotations

import unittest

from server_modules import product_catalog_live_data_service
from server_modules import studio_proof_agent_seed_service


def _deployed_agent_with_catalog(source: dict[str, object]) -> dict[str, object]:
    return {
        "id": "dagent_shop",
        "tenant_id": "tenant-1",
        "owner_workspace_id": "ws-1",
        "metadata": {
            "live_data_connectors": {
                "product_catalog": {
                    "source_id": "product_catalog",
                    "deployed_agent_id": "dagent_shop",
                    "workspace_id": "ws-1",
                    **source,
                }
            }
        },
    }


class ProductCatalogLiveDataServiceTests(unittest.TestCase):
    def test_csv_catalog_lookup_answers_availability_from_live_rows(self) -> None:
        agent = _deployed_agent_with_catalog(
            {
                "connector_type": "csv",
                "csv_text": "\n".join(
                    [
                        "sku,product_name,category,price,currency,quantity_available,variant,brand,shipping_eta_days,aliases",
                        "SHOE-AIRMAX-42-BLK,Nike Air Max 90,shoes,129,USD,8,black / size 42,Nike,2,airmax black 42",
                    ]
                ),
            }
        )

        result = product_catalog_live_data_service.lookup_product_catalog(
            agent,
            workspace_id="ws-1",
            query="Do you have Nike Air Max black size 42?",
        )

        self.assertTrue(result["read_only"])
        self.assertEqual(result["matches"][0]["sku"], "SHOE-AIRMAX-42-BLK")
        self.assertIn("8 in stock", result["answer"])
        self.assertEqual(result["source"]["connector_type"], "csv")

    def test_google_sheets_shaped_rows_lookup_without_inventory_hallucination(self) -> None:
        agent = _deployed_agent_with_catalog(
            {
                "connector_type": "google_sheets",
                "connector_id": "gsheet-products-1",
                "rows": [
                    {
                        "sku": "SHOE-ULTRABOOST-41-WHT",
                        "product_name": "Adidas Ultraboost 23",
                        "category": "shoes",
                        "price": 149.0,
                        "currency": "USD",
                        "quantity_available": 5,
                        "variant": "white / size 41",
                        "brand": "Adidas",
                    }
                ],
            }
        )

        result = product_catalog_live_data_service.lookup_product_catalog(
            agent,
            workspace_id="ws-1",
            connector_id="gsheet-products-1",
            query="Do you have a red hiking backpack?",
        )

        self.assertEqual(result["matches"], [])
        self.assertIn("No matching catalog row", result["answer"])
        self.assertEqual(result["source"]["connector_type"], "google_sheets")

    def test_catalog_source_is_scoped_to_agent_and_workspace(self) -> None:
        wrong_agent_source = {
            "connector_type": "google_sheets",
            "deployed_agent_id": "dagent_other",
            "workspace_id": "ws-1",
            "rows": [
                {
                    "sku": "SKU-1",
                    "product_name": "Private Product",
                    "category": "private",
                    "price": 1,
                    "currency": "USD",
                    "quantity_available": 1,
                }
            ],
        }
        agent = _deployed_agent_with_catalog(wrong_agent_source)

        with self.assertRaises(PermissionError):
            product_catalog_live_data_service.lookup_product_catalog(
                agent,
                workspace_id="ws-1",
                query="Private Product",
            )

        wrong_workspace_agent = _deployed_agent_with_catalog(
            {
                **wrong_agent_source,
                "deployed_agent_id": "dagent_shop",
                "workspace_id": "ws-2",
            }
        )
        with self.assertRaises(PermissionError):
            product_catalog_live_data_service.lookup_product_catalog(
                wrong_workspace_agent,
                workspace_id="ws-1",
                query="Private Product",
            )

    def test_read_only_action_blocks_writes(self) -> None:
        agent = _deployed_agent_with_catalog(
            {
                "connector_type": "google_sheets",
                "rows": [
                    {
                        "sku": "SKU-1",
                        "product_name": "Private Product",
                        "category": "private",
                        "price": 1,
                        "currency": "USD",
                        "quantity_available": 1,
                    }
                ],
            }
        )

        with self.assertRaises(PermissionError):
            product_catalog_live_data_service.execute_read_only_catalog_action(
                agent,
                workspace_id="ws-1",
                action_id="catalog.update",
                arguments={"query": "Private Product"},
            )

    def test_golden_shop_assistant_catalog_question_uses_demo_catalog(self) -> None:
        contract = studio_proof_agent_seed_service.get_studio_proof_agent_seed_contract("shop-assistant")
        self.assertIsNotNone(contract)
        revenue_proof = contract["revenue_proof"]
        agent = _deployed_agent_with_catalog(
            {
                "connector_type": "google_sheets",
                "rows": revenue_proof["demo_catalog_rows"],
            }
        )

        result = product_catalog_live_data_service.lookup_product_catalog(
            agent,
            workspace_id="ws-1",
            query="Do you have Nike Air Max 90 in black size 42?",
        )

        self.assertEqual(result["matches"][0]["sku"], "SHOE-AIRMAX-42-BLK")
        self.assertIn("8 in stock", result["answer"])
        self.assertNotIn("red hiking backpack", result["answer"].lower())


if __name__ == "__main__":
    unittest.main()
