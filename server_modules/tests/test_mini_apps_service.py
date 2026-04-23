from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import mini_apps_service, workspace_context


class MiniAppsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="mini-apps-service-")
        self._workspace_root = Path(self._tmpdir.name) / "workspace"
        self._workspace_patch = patch.object(workspace_context, "_WORKSPACE_DIR", self._workspace_root)
        self._workspace_patch.start()

    def tearDown(self) -> None:
        self._workspace_patch.stop()
        self._tmpdir.cleanup()

    def test_upsert_and_list_contracts_preserve_shared_contract_shape(self) -> None:
        mini_apps_service.upsert_mini_app_contract(
            "ws-1",
            "calorie_tracking",
            label="Calorie Tracking",
            current_state={"today_calories": 1840, "goal": 2200},
            recent_events=[
                {"id": "meal-1", "kind": "meal", "summary": "Chicken bowl", "created_at": "2026-04-17T08:00:00Z"},
            ],
            daily_summary={"status": "under goal"},
            weekly_summary={"trend": "stable"},
            long_term_facts=["Cutting phase", {"text": "Protein target is 180g", "kind": "goal"}],
            records=[
                {"id": "meal-1", "kind": "meal", "summary": "Chicken bowl", "tags": ["lunch"], "created_at": "2026-04-17T08:00:00Z"},
                {"id": "meal-2", "kind": "meal", "summary": "Protein yogurt", "tags": ["breakfast"], "created_at": "2026-04-16T07:00:00Z"},
            ],
        )

        listing = mini_apps_service.list_mini_app_contracts("ws-1")

        self.assertEqual(listing["count"], 1)
        contract = listing["items"][0]
        self.assertEqual(contract["app_id"], "calorie_tracking")
        self.assertEqual(contract["label"], "Calorie Tracking")
        self.assertEqual(contract["current_state"]["today_calories"], 1840)
        self.assertEqual(contract["retrieve_records"]["default_limit"], mini_apps_service.DEFAULT_RETRIEVE_LIMIT)
        self.assertIn("since", contract["retrieve_records"]["supported_filters"])
        self.assertEqual(contract["records_count"], 2)

    def test_retrieve_records_filters_narrow_history(self) -> None:
        mini_apps_service.upsert_mini_app_contract(
            "ws-1",
            "flashcards",
            records=[
                {"id": "card-1", "kind": "review", "tags": ["spanish", "verbs"], "created_at": "2026-04-17T09:00:00Z", "summary": "Reviewed estar"},
                {"id": "card-2", "kind": "review", "tags": ["spanish", "food"], "created_at": "2026-04-16T09:00:00Z", "summary": "Reviewed desayuno"},
                {"id": "card-3", "kind": "create", "tags": ["math"], "created_at": "2026-04-15T09:00:00Z", "summary": "Added calculus card"},
            ],
        )

        payload = mini_apps_service.retrieve_mini_app_records(
            "ws-1",
            "flashcards",
            filters={"tag": "spanish", "kind": "review", "since": "2026-04-16T12:00:00Z"},
        )

        self.assertEqual(payload["total_matches"], 1)
        self.assertEqual(payload["items"][0]["id"], "card-1")

    def test_context_block_uses_compact_summaries_not_full_raw_history(self) -> None:
        mini_apps_service.upsert_mini_app_contract(
            "ws-1",
            "speaking",
            label="Speaking Practice",
            current_state={"language": "Spanish", "streak_days": 5},
            recent_events=[
                {"id": "session-1", "summary": "Practiced introductions for 20 minutes", "created_at": "2026-04-17T08:00:00Z"},
            ],
            weekly_summary={"trend": "confidence improving"},
            long_term_facts=["Listening is weaker than speaking"],
            records=[
                {"id": "raw-1", "transcript": "very long raw transcript should not appear in compact block", "created_at": "2026-04-17T08:00:00Z"},
            ],
        )

        block = mini_apps_service.build_mini_apps_context_block("ws-1")

        self.assertIn("Mini App Summaries", block)
        self.assertIn("Speaking Practice", block)
        self.assertIn("streak days: 5", block.lower())
        self.assertIn("Retrieval hook", block)
        self.assertNotIn("very long raw transcript", block)

    def test_hosted_contract_exposes_embed_and_bridge_manifest_without_sage_memory(self) -> None:
        contract = mini_apps_service.upsert_mini_app_contract(
            "ws-1",
            "travel_partner",
            label="Travel Partner",
            description="Hosted itinerary planner",
            delivery_mode="hosted",
            hosted_url="https://miniapps.example.com/travel",
            allowed_origins=["https://miniapps.example.com"],
            bridge_contracts={"app_to_sage": ["summary_request"]},
            context_envelope={"default_classes": ["user_selected_inputs"]},
            permissions=["bridge.app_to_sage.summary_request"],
        )

        self.assertEqual(contract["delivery_mode"], "hosted")
        self.assertEqual(contract["memory_scope"], "none_by_default")
        self.assertEqual(contract["hosted_url"], "https://miniapps.example.com/travel")
        self.assertEqual(contract["hosted_app"]["embed"]["kind"], "iframe")
        self.assertEqual(contract["hosted_app"]["allowed_origins"], ["https://miniapps.example.com"])
        self.assertEqual(contract["hosted_app"]["bridge"]["allowed_contracts"]["app_to_sage"], ["summary_request"])
        self.assertFalse(contract["context_envelope"]["inherits_sage_memory_by_default"])

        manifest = mini_apps_service.get_hosted_mini_app_manifest("ws-1", "travel_partner")
        self.assertEqual(manifest["delivery_mode"], "hosted")
        self.assertEqual(manifest["hosted_app"]["bridge"]["request_type"], "empyralis.hosted_app.bridge.request")
        self.assertIn("read_sage_memory", manifest["hosted_app"]["bridge"]["denied_by_default"])


if __name__ == "__main__":
    unittest.main()
