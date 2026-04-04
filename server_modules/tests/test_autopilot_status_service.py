import unittest

from server_modules.connectors.autopilot_status_service import AutopilotStatusService


class AutopilotStatusServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> AutopilotStatusService:
        return AutopilotStatusService(
            normalize_workspace_id=overrides.pop("normalize_workspace_id", lambda value: str(value or "")),
            telegram_snapshot=overrides.pop("telegram_snapshot", lambda: {"enabled": True, "connectors": {}}),
            telegram_list_entries=overrides.pop("telegram_list_entries", lambda: []),
            resolve_telegram_profile=overrides.pop("resolve_telegram_profile", lambda entry: {"id": "tg", "prefix": "/empyralis", "require_prefix": True}),
            whatsapp_snapshot=overrides.pop("whatsapp_snapshot", lambda: {"enabled": True, "connectors": {}}),
            whatsapp_list_entries=overrides.pop("whatsapp_list_entries", lambda: []),
            resolve_whatsapp_profile=overrides.pop("resolve_whatsapp_profile", lambda entry: {"id": "wa", "prefix": "/empyralis", "require_prefix": False}),
        )

    def test_telegram_status_payload_maps_connectors_and_snapshot(self) -> None:
        service = self._make_service(
            telegram_snapshot=lambda: {
                "enabled": True,
                "active": True,
                "thread_alive": True,
                "started_at": "2026-04-04T00:00:00Z",
                "connectors": {
                    "conn-1": {
                        "last_update_id": 7,
                        "allow_from": ["alice"],
                        "dropped_sender_count": 2,
                    }
                },
            },
            telegram_list_entries=lambda: [{"id": "conn-1", "label": "Telegram 1", "workspace_id": "ws-1"}],
        )
        payload = service.telegram_status_payload()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["connectors"][0]["id"], "conn-1")
        self.assertEqual(payload["connectors"][0]["last_update_id"], 7)
        self.assertEqual(payload["connectors"][0]["allow_from"], ["alice"])

    def test_whatsapp_status_payload_maps_connectors_and_vault_error(self) -> None:
        service = self._make_service(
            whatsapp_snapshot=lambda: {
                "enabled": True,
                "active": True,
                "thread_alive": True,
                "connectors": {
                    "wa-1": {
                        "last_action": "run",
                        "last_message_sid": "SM123",
                    }
                },
            },
            whatsapp_list_entries=lambda: (_ for _ in ()).throw(RuntimeError("vault down")),
        )
        payload = service.whatsapp_status_payload()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["vault_error"], "vault down")
        self.assertEqual(payload["connectors"], [])


if __name__ == "__main__":
    unittest.main()
