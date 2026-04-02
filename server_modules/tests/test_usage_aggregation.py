import unittest
from datetime import datetime, timezone

from server_modules.usage_reporting import (
    aggregate_usage_summary,
    build_usage_record,
    estimate_cost_usd,
    usage_row_from_snapshot,
)


class UsageAggregationTests(unittest.TestCase):
    def _snapshot(
        self,
        run_id: str,
        *,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        created_at: str = "2026-04-02T08:00:00Z",
    ):
        usage = build_usage_record(
            provider,
            model,
            prompt_tokens,
            completion_tokens,
            prompt_tokens + completion_tokens,
            run_id=run_id,
            timestamp=created_at,
        )
        return {
            "run_id": run_id,
            "status": "completed",
            "owner_user_id": "user-1",
            "user_goal": f"Run {run_id}",
            "created_at": created_at,
            "completed_at": created_at,
            "usage_masked": usage,
        }

    def test_summary_totals_correct(self):
        snapshots = [
            self._snapshot("run-1", provider="openai", model="gpt-4", prompt_tokens=100_000, completion_tokens=50_000),
            self._snapshot("run-2", provider="anthropic", model="claude-3-5-sonnet-20241022", prompt_tokens=10_000, completion_tokens=5_000),
        ]

        summary = aggregate_usage_summary(
            snapshots,
            period="all",
            now=datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(summary["total_tokens"], 165_000)
        self.assertEqual(summary["runs_count"], 2)
        self.assertEqual(len(summary["daily"]), 1)
        self.assertAlmostEqual(summary["total_cost_usd"], 6.105, places=6)

    def test_by_provider_breakdown(self):
        snapshots = [
            self._snapshot("run-1", provider="openai", model="gpt-4", prompt_tokens=100_000, completion_tokens=50_000),
            self._snapshot("run-2", provider="openai", model="gpt-4", prompt_tokens=25_000, completion_tokens=25_000),
            self._snapshot("run-3", provider="anthropic", model="claude-3-5-sonnet-20241022", prompt_tokens=10_000, completion_tokens=5_000),
        ]

        summary = aggregate_usage_summary(
            snapshots,
            period="all",
            now=datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(summary["by_provider"][0]["provider"], "openai")
        self.assertEqual(summary["by_provider"][0]["total_tokens"], 200_000)
        self.assertEqual(summary["by_provider"][0]["runs_count"], 2)
        self.assertGreater(summary["by_provider"][0]["percentage"], 90.0)

    def test_cost_calculation_openai_gpt4(self):
        cost = estimate_cost_usd("openai", "gpt-4", 100_000, 50_000)
        self.assertIsNotNone(cost)
        self.assertAlmostEqual(float(cost or 0.0), 6.0, places=6)

    def test_unknown_model_cost_is_null(self):
        usage = build_usage_record("openai", "unknown-frontier-model", 1_000, 2_000, 3_000)
        self.assertIsNone(usage["estimated_cost_usd"])
        self.assertIsNone(usage["cost_est_usd"])
        self.assertEqual(usage["cost_band"], "Unknown")

        snapshot = {
            "run_id": "run-unknown",
            "status": "completed",
            "owner_user_id": "user-1",
            "user_goal": "Unknown model run",
            "created_at": "2026-04-02T08:00:00Z",
            "completed_at": "2026-04-02T08:00:00Z",
            "usage_masked": usage,
        }
        row = usage_row_from_snapshot(snapshot)
        self.assertIsNotNone(row)
        self.assertIsNone(row["estimated_cost_usd"])


if __name__ == "__main__":
    unittest.main()
