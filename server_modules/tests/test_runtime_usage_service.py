import threading
import unittest

from fastapi import HTTPException

from server_modules import runtime_usage_service


class RuntimeUsageServiceTests(unittest.TestCase):
    def test_normalize_usage_period_defaults_to_all(self):
        self.assertEqual(runtime_usage_service.normalize_usage_period("week"), "week")
        self.assertEqual(runtime_usage_service.normalize_usage_period("bad"), "all")
        self.assertEqual(runtime_usage_service.normalize_usage_period(None), "all")

    def test_usage_snapshots_for_user_merges_archived_and_live_snapshots(self):
        snapshots = runtime_usage_service.usage_snapshots_for_user(
            {"user_id": "user-1"},
            refresh_server_exports=lambda: None,
            run_history_lock=threading.Lock(),
            run_history=[{"run_id": "archived-1", "owner_user_id": "user-1"}],
            runs={
                "live-1": {"usage_masked": {"tokens": 1}, "owner_user_id": "user-1"},
                "skip-1": {"usage_masked": None},
            },
            serialize_snapshot=lambda run_id, run: {"run_id": run_id, "owner_user_id": run.get("owner_user_id")},
            current_user_is_privileged=lambda current_user: False,
            extract_run_owner_user_id=lambda payload: str(payload.get("owner_user_id") or ""),
        )

        self.assertEqual(
            {item["run_id"] for item in snapshots},
            {"archived-1", "live-1"},
        )

    def test_usage_snapshots_for_user_requires_user_id_for_non_privileged_users(self):
        with self.assertRaises(HTTPException):
            runtime_usage_service.usage_snapshots_for_user(
                {},
                refresh_server_exports=lambda: None,
                run_history_lock=threading.Lock(),
                run_history=[],
                runs={},
                serialize_snapshot=lambda run_id, run: {},
                current_user_is_privileged=lambda current_user: False,
                extract_run_owner_user_id=lambda payload: "",
            )


if __name__ == "__main__":
    unittest.main()
