import unittest

from fastapi import HTTPException

from server_modules import runtime_run_replay_service


class RuntimeRunReplayServiceTests(unittest.TestCase):
    def test_replay_item_response_wraps_payload(self):
        payload = runtime_run_replay_service.replay_item_response(item={"run_id": "run-1"})

        self.assertEqual(payload, {"item": {"run_id": "run-1"}})

    def test_replay_run_from_item_requires_replay_request(self):
        with self.assertRaises(HTTPException):
            runtime_run_replay_service.replay_run_from_item(
                item={},
                run_start_request_class=lambda **kwargs: kwargs,
                execute_system_run_start_request_via_turn_runtime=lambda *args, **kwargs: {},
                stamp_request_owner_fn=lambda *args, **kwargs: None,
                run_execution_services=lambda: "services",
            )

    def test_replay_run_from_item_executes_turn_runtime(self):
        calls = {}

        payload = runtime_run_replay_service.replay_run_from_item(
            item={"replay_request": {"engine": "orion", "workspace_id": "default"}},
            run_start_request_class=lambda **kwargs: {"request": kwargs},
            execute_system_run_start_request_via_turn_runtime=lambda request, **kwargs: calls.update(
                {"request": request, **kwargs}
            )
            or {"run_id": "run-1"},
            stamp_request_owner_fn=lambda *args, **kwargs: None,
            run_execution_services=lambda: "services",
        )

        self.assertEqual(payload["run_id"], "run-1")
        self.assertEqual(calls["request"]["request"]["engine"], "orion")
        self.assertEqual(calls["services"], "services")


if __name__ == "__main__":
    unittest.main()
