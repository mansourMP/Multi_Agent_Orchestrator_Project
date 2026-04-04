import unittest

from server_modules.connectors.autopilot_shared_service_registry import AutopilotSharedServiceRegistry


class AutopilotSharedServiceRegistryTests(unittest.TestCase):
    def _make_registry(self) -> AutopilotSharedServiceRegistry:
        return AutopilotSharedServiceRegistry(
            normalize_workspace_id=lambda value: str(value or ""),
            telegram_snapshot=lambda: {"enabled": True},
            telegram_list_entries=lambda: [{"id": "tg-1"}],
            resolve_telegram_profile=lambda entry: {"id": "assistant"},
            whatsapp_snapshot=lambda: {"enabled": True},
            whatsapp_list_entries=lambda: [{"id": "wa-1"}],
            resolve_whatsapp_profile=lambda entry: {"id": "assistant"},
        )

    def test_registry_caches_status_and_endpoint_services(self) -> None:
        registry = self._make_registry()
        self.assertIs(registry.autopilot_status_service(), registry.autopilot_status_service())
        self.assertIs(registry.autopilot_endpoint_service(), registry.autopilot_endpoint_service())


if __name__ == "__main__":
    unittest.main()
