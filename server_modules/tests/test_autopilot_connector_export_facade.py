import unittest

from server_modules.connectors.autopilot_connector_export_facade import AutopilotConnectorExportFacade


class _FakeRuntimeFacade:
    def __init__(self):
        self.calls = []

    def record_channel_event_throttled(self, **kwargs):
        self.calls.append(kwargs)
        return kwargs["record_event_func"](
            channel="telegram",
            direction="system",
            event_type="error",
            text="test",
        )


class _FakeShell:
    def __init__(self, runtime_facade):
        self._runtime_facade = runtime_facade

    def runtime_facade_service(self):
        return self._runtime_facade

    def registry_facade_service(self):
        raise AssertionError("registry facade should not be used in this test")

    def bridge_facade_service(self):
        raise AssertionError("bridge facade should not be used in this test")


class AutopilotConnectorExportFacadeTests(unittest.TestCase):
    def test_record_channel_event_throttled_uses_late_bound_module_export(self) -> None:
        runtime_facade = _FakeRuntimeFacade()
        namespace = {
            "_autopilot_connector_shell_service": lambda: _FakeShell(runtime_facade),
        }
        facade = AutopilotConnectorExportFacade(global_namespace=namespace)

        seen = []
        namespace["_record_channel_event"] = lambda **kwargs: seen.append(kwargs) or True

        result = facade.record_channel_event_throttled(
            channel="telegram",
            direction="system",
            event_type="error",
            text="timeout",
            dedupe_seconds=30.0,
        )

        self.assertTrue(result)
        self.assertEqual(len(runtime_facade.calls), 1)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["event_type"], "error")


if __name__ == "__main__":
    unittest.main()
