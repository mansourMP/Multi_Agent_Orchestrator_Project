import threading
import unittest

from server_modules import runtime_heartbeat_service
from server_modules import runtime_route_bootstrap_service


class _DummyScheduler:
    def __init__(self) -> None:
        self.started = False

    def start(self) -> None:
        self.started = True


class RuntimeRouteBootstrapServiceTests(unittest.TestCase):
    def test_import_runtime_run_route_dependencies_loads_expected_members(self):
        modules = {
            "server_modules.autopilot_connectors": type(
                "Connectors",
                (),
                {"handle_telegram_send_message": staticmethod(lambda *args, **kwargs: None)},
            )(),
            "server_modules.memory_service": type(
                "MemoryService",
                (),
                {
                    "delete_memory": staticmethod(lambda *args, **kwargs: None),
                    "workspace_memory_snapshot": staticmethod(lambda *args, **kwargs: {}),
                },
            )(),
            "server_modules.runtime_models": type(
                "RuntimeModels",
                (),
                {"RunStartRequest": type("RunStartRequest", (), {})},
            )(),
            "server_modules.workspace_context": type(
                "WorkspaceContext",
                (),
                {
                    "read_workspace_context_files": staticmethod(lambda: []),
                    "write_workspace_context_file": staticmethod(lambda *args, **kwargs: None),
                },
            )(),
            "server_modules.runs_core": type(
                "RunsCore",
                (),
                {"trigger_pending_heartbeat_schedules": staticmethod(lambda: {"started": []})},
            )(),
        }
        module_globals = {"existing": 1}
        server_module = type("ServerModule", (), {})()
        server_module.FOO = "bar"

        deps = runtime_route_bootstrap_service.import_runtime_run_route_dependencies(
            import_module=lambda name, fromlist=(): modules[name],
            module_globals=module_globals,
            server_module=server_module,
        )

        self.assertEqual(module_globals["FOO"], "bar")
        self.assertTrue(callable(deps.handle_telegram_send_message))
        self.assertTrue(callable(deps.trigger_pending_heartbeat_schedules))

    def test_ensure_runtime_run_route_bootstrap_starts_scheduler_and_loads_webhooks(self):
        created = []
        loaded = []

        scheduler = runtime_route_bootstrap_service.ensure_runtime_run_route_bootstrap(
            heartbeat_lock=threading.Lock(),
            heartbeat_scheduler=None,
            heartbeat_scheduler_factory=lambda: created.append(_DummyScheduler()) or created[-1],
            ensure_heartbeat_scheduler_started=runtime_heartbeat_service.ensure_heartbeat_scheduler_started,
            load_webhook_triggers=lambda: loaded.append(True),
        )

        self.assertIs(scheduler, created[0])
        self.assertTrue(created[0].started)
        self.assertEqual(loaded, [True])


if __name__ == "__main__":
    unittest.main()
