import unittest

from server_modules.connectors.autopilot_connector_shell_builder import build_autopilot_connector_shell_service


class _FakeShellService:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class AutopilotConnectorShellBuilderTests(unittest.TestCase):
    def test_builder_keeps_late_bound_runtime_callbacks(self) -> None:
        namespace: dict[str, object] = {
            "_normalize_workspace_id": lambda value: f"ws:{value}",
        }

        built = build_autopilot_connector_shell_service(
            global_namespace=namespace,
            sync_server_globals=("X",),
            server_getter=lambda: None,
            server_setter=lambda value: None,
            import_server=lambda: object(),
            shell_service_class=_FakeShellService,
        )

        self.assertEqual(built.kwargs["normalize_workspace_id"]("alpha"), "ws:alpha")
        self.assertEqual(built.kwargs["run_history"], {})
        self.assertEqual(built.kwargs["local_worker_registry"], {})

        create_calls: list[dict[str, object]] = []
        namespace["create_run"] = lambda **kwargs: create_calls.append(kwargs) or "run-1"
        result = built.kwargs["create_run"](engine="orion", context={"metadata": {}})

        self.assertEqual(result, "run-1")
        self.assertEqual(create_calls[0]["engine"], "orion")


if __name__ == "__main__":
    unittest.main()
