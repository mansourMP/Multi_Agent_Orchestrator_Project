import threading
import unittest

from server_modules import runtime_heartbeat_service


class _Scheduler:
    def __init__(self) -> None:
        self.started = 0

    def start(self) -> None:
        self.started += 1

    def status(self) -> dict[str, object]:
        return {"running": True}

    def trigger_now(self) -> dict[str, object]:
        return {"triggered": True}


class RuntimeHeartbeatServiceTests(unittest.TestCase):
    def test_heartbeat_scheduler_returns_current_instance(self):
        scheduler = _Scheduler()

        result = runtime_heartbeat_service.heartbeat_scheduler(
            lock=threading.Lock(),
            scheduler=scheduler,
        )

        self.assertIs(result, scheduler)

    def test_ensure_heartbeat_scheduler_started_starts_once(self):
        created = []

        result = runtime_heartbeat_service.ensure_heartbeat_scheduler_started(
            lock=threading.Lock(),
            scheduler=None,
            scheduler_factory=lambda: created.append(_Scheduler()) or created[-1],
        )

        self.assertIs(result, created[0])
        self.assertEqual(created[0].started, 1)

    def test_heartbeat_status_payload_handles_missing_scheduler(self):
        self.assertEqual(
            runtime_heartbeat_service.heartbeat_status_payload(scheduler=None)["ok"],
            False,
        )

    def test_trigger_heartbeat_payload_raises_without_scheduler(self):
        with self.assertRaises(RuntimeError):
            runtime_heartbeat_service.trigger_heartbeat_payload(scheduler=None)

    def test_build_heartbeat_run_callback_returns_noop_summary_without_tasks_or_pending(self):
        callback = runtime_heartbeat_service.build_heartbeat_run_callback(
            build_inbound_agent_turn_request=lambda **kwargs: kwargs,
            trigger_pending_heartbeat_schedules=lambda: {"started": []},
            execute_system_agent_turn=lambda **kwargs: {"run_id": "run-1"},
            run_execution_services=lambda: object(),
        )

        payload = callback([], {"workspace_id": "default"})

        self.assertEqual(payload, {"acted": False, "summary": "No pending heartbeat tasks."})

    def test_build_heartbeat_run_callback_starts_run_for_tasks(self):
        captured = {}
        callback = runtime_heartbeat_service.build_heartbeat_run_callback(
            build_inbound_agent_turn_request=lambda **kwargs: captured.setdefault("request", kwargs) or kwargs,
            trigger_pending_heartbeat_schedules=lambda: {"started": [{"run_id": "pending-1"}]},
            execute_system_agent_turn=lambda **kwargs: {"run_id": "run-1"},
            run_execution_services=lambda: object(),
        )

        payload = callback(["Check inbox"], {"workspace_id": "default", "trigger": "manual", "heartbeat_file": "HEARTBEAT.md"})

        self.assertTrue(payload["acted"])
        self.assertEqual(payload["run_id"], "run-1")
        self.assertEqual(captured["request"]["execution_mode"], "durable")
        self.assertEqual(captured["request"]["response_mode"], "artifact")
        self.assertIn("Check inbox", captured["request"]["message"])
        self.assertEqual(captured["request"]["context_hints"]["metadata"]["heartbeat_trigger"], "manual")

    def test_build_heartbeat_turn_request_shapes_canonical_durable_turn(self):
        turn_request = runtime_heartbeat_service.build_heartbeat_turn_request(
            build_inbound_agent_turn_request=lambda **kwargs: kwargs,
            tasks=["Check inbox"],
            metadata={
                "workspace_id": "default",
                "tenant_id": "tenant-1",
                "owner_user_id": "user-1",
                "owner_email": "user@example.com",
                "trigger": "scheduled",
                "execution_target": "local_companion",
                "trust_mode": "guarded",
            },
            pending_started=[{"run_id": "pending-1"}],
        )

        self.assertEqual(turn_request["tenant_id"], "tenant-1")
        self.assertEqual(turn_request["workspace_id"], "default")
        self.assertEqual(turn_request["execution_mode"], "durable")
        self.assertEqual(turn_request["response_mode"], "artifact")
        self.assertEqual(turn_request["actor_id"], "user-1")
        self.assertEqual(turn_request["policy_context"]["execution_target"], "local_companion")
        self.assertEqual(turn_request["policy_context"]["trust_mode"], "guarded")
        self.assertEqual(turn_request["context_hints"]["metadata"]["source"], "heartbeat")

    def test_build_heartbeat_notify_callback_uses_telegram_sender(self):
        seen = []

        async def _send(message: str, workspace_id: str = "default"):
            seen.append((message, workspace_id))

        callback = runtime_heartbeat_service.build_heartbeat_notify_callback(
            handle_telegram_send_message=_send,
        )
        callback("ping")

        self.assertEqual(seen, [("ping", "default")])


if __name__ == "__main__":
    unittest.main()
