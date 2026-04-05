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


if __name__ == "__main__":
    unittest.main()
