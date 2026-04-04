import unittest

from server_modules.connectors.telegram_autopilot_supervisor_service import TelegramAutopilotSupervisorService


class _LoopStub:
    def __init__(self, iterations):
        self.iterations = list(iterations)

    def run_iteration(self):
        if not self.iterations:
            raise RuntimeError("done")
        value = self.iterations.pop(0)
        if isinstance(value, BaseException):
            raise value
        return value


class TelegramAutopilotSupervisorServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramAutopilotSupervisorService:
        started = overrides.pop("started", [])
        persisted = overrides.pop("persisted", [])
        logs = overrides.pop("logs", [])
        sleeps = overrides.pop("sleeps", [])
        loop = overrides.pop("loop", _LoopStub([5.0, RuntimeError("stop")]))
        return TelegramAutopilotSupervisorService(
            poll_seconds=5.0,
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-05T00:00:00Z"),
            mark_started=lambda started_at: started.append(started_at),
            persist_state=lambda: persisted.append(True),
            autopilot_log=lambda message: logs.append(message),
            require_prefix=overrides.pop("require_prefix", True),
            prefix=overrides.pop("prefix", "/orion"),
            loop_service=lambda: loop,
            sleep=lambda seconds: sleeps.append(seconds),
        )

    def test_run_forever_marks_started_logs_and_sleeps(self) -> None:
        started = []
        persisted = []
        logs = []
        sleeps = []
        service = self._make_service(started=started, persisted=persisted, logs=logs, sleeps=sleeps)
        with self.assertRaisesRegex(RuntimeError, "stop"):
            service.run_forever()
        self.assertEqual(started, ["2026-04-05T00:00:00Z"])
        self.assertEqual(persisted, [True])
        self.assertEqual(sleeps, [5.0])
        self.assertIn("enabled", logs[0])

    def test_run_forever_enforces_minimum_sleep_floor(self) -> None:
        sleeps = []
        service = self._make_service(sleeps=sleeps, loop=_LoopStub([0.1, RuntimeError("stop")]))
        with self.assertRaisesRegex(RuntimeError, "stop"):
            service.run_forever()
        self.assertEqual(sleeps, [0.25])


if __name__ == "__main__":
    unittest.main()
