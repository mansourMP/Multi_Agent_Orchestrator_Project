import threading
import unittest

from fastapi import HTTPException

from server_modules import runtime_history_service


class RuntimeHistoryServiceTests(unittest.TestCase):
    def test_build_runs_history_payload_filters_and_counts_children(self):
        payload = runtime_history_service.build_runs_history_payload(
            limit=10,
            workspace_id=None,
            status=None,
            pack_id=None,
            current_user={"user_id": "user-1"},
            refresh_server_exports=lambda: None,
            run_history_lock=threading.Lock(),
            run_history=[
                {"run_id": "parent-1", "owner_user_id": "user-1"},
                {"run_id": "child-1", "owner_user_id": "user-1", "parent_run_id": "parent-1"},
                {"run_id": "other-1", "owner_user_id": "user-2"},
            ],
            history_item_matches=lambda item, workspace_id, status, pack_id: True,
            current_user_is_privileged=lambda current_user: False,
            extract_run_owner_user_id=lambda item: str(item.get("owner_user_id") or ""),
            normalize_run_id_token=lambda value: str(value).strip() or None,
            summarize_history_item=lambda item: {"run_id": item.get("run_id")},
        )

        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["total"], 2)
        parent = next(item for item in payload["items"] if item["run_id"] == "parent-1")
        self.assertEqual(parent["child_run_count"], 1)

    def test_build_runs_history_payload_requires_user_id_for_non_privileged_user(self):
        with self.assertRaises(HTTPException):
            runtime_history_service.build_runs_history_payload(
                limit=10,
                workspace_id=None,
                status=None,
                pack_id=None,
                current_user={},
                refresh_server_exports=lambda: None,
                run_history_lock=threading.Lock(),
                run_history=[],
                history_item_matches=lambda item, workspace_id, status, pack_id: True,
                current_user_is_privileged=lambda current_user: False,
                extract_run_owner_user_id=lambda item: "",
                normalize_run_id_token=lambda value: None,
                summarize_history_item=lambda item: {},
            )


if __name__ == "__main__":
    unittest.main()
