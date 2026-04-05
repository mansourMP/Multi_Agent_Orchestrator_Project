import unittest

from fastapi import HTTPException

from server_modules import runtime_run_control_service


class RuntimeRunControlServiceTests(unittest.TestCase):
    def test_build_resume_waiting_run_callbacks_preserves_callables(self):
        serialize_run_snapshot = lambda run_id, run: {"run_id": run_id}
        callbacks = runtime_run_control_service.build_resume_waiting_run_callbacks(
            serialize_run_snapshot=serialize_run_snapshot,
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: None,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, run: True,
        )

        self.assertIs(callbacks["serialize_run_snapshot"], serialize_run_snapshot)
        self.assertIn("schedule_restored_run_resume", callbacks)

    def test_resume_waiting_run_requires_checkpoint(self):
        with self.assertRaises(HTTPException):
            runtime_run_control_service.resume_waiting_run(
                "run-1",
                run={"status": "waiting_for_input", "logs": object()},
                current_user={"user_id": "user-1"},
                serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                get_pending_confirmation=lambda run: None,
                emit_log=lambda *args, **kwargs: None,
                schedule_restored_run_resume=lambda run_id, run: True,
            )

    def test_resume_waiting_run_returns_resume_payload(self):
        emitted = []

        payload = runtime_run_control_service.resume_waiting_run(
            "run-1",
            run={
                "status": "waiting_for_input",
                "logs": object(),
                "browser_checkpoint": {
                    "next_action_index": 3,
                    "session_profile": "qa-browser",
                },
            },
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: None,
            emit_log=lambda *args, **kwargs: emitted.append(kwargs),
            schedule_restored_run_resume=lambda run_id, run: True,
        )

        self.assertEqual(payload["resume_kind"], "browser_checkpoint")
        self.assertEqual(payload["next_action_index"], 3)
        self.assertEqual(emitted[0]["event"], "browser_resume_requested")


if __name__ == "__main__":
    unittest.main()
