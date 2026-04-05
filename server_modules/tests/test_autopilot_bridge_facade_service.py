import unittest

from server_modules.connectors.autopilot_bridge_facade_service import AutopilotBridgeFacadeService


class _FakeStateService:
    def snapshot(self, *, include_connectors=False):
        return {"include_connectors": include_connectors}

    def list_connector_entries(self, workspace_id):
        return [{"workspace_id": workspace_id}]


class _FakeRegistryDeps:
    def telegram_autopilot_state_service(self):
        return _FakeStateService()

    def whatsapp_autopilot_state_service(self):
        return _FakeStateService()

    def telegram_autopilot_runtime_service(self):
        return {"runtime": True}

    def telegram_autopilot_supervisor_service(self):
        return {"supervisor": True}

    def whatsapp_webhook_service(self):
        class _Webhook:
            def handle_inbound(self, payload):
                return payload

        return _Webhook()

    def whatsapp_transport_service(self):
        class _Transport:
            def twiml_response(self, text):
                return {"twiml": text}

        return _Transport()


class _FakeProfileService:
    def resolve_telegram_profile(self, entry):
        return {"telegram": entry}

    def resolve_whatsapp_profile(self, entry):
        return {"whatsapp": entry}


class _FakeSharedServiceRegistry:
    def autopilot_status_service(self):
        return {"status": True}

    def autopilot_endpoint_service(self):
        class _Endpoint:
            def whatsapp_webhook_result(self, **kwargs):
                return kwargs

        return _Endpoint()

    def autopilot_event_service(self):
        return {"event": True}


class _FakeBridgeRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.shared = _FakeSharedServiceRegistry()
        type(self).instances.append(self)

    def shared_service_registry(self):
        return self.shared

    def event_bridge_service(self):
        return {"event_bridge": True}

    def terminal_bridge_service(self):
        return {"terminal_bridge": True}

    def state_bridge_service(self):
        return {"state_bridge": True}

    def compatibility_bridge_service(self):
        return {"compatibility_bridge": True}

    def webhook_bridge_service(self):
        return {"webhook_bridge": True}


class AutopilotBridgeFacadeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeBridgeRegistry.instances.clear()

    def test_facade_caches_bridge_registry_and_exposes_services(self) -> None:
        service = AutopilotBridgeFacadeService(
            normalize_workspace_id=lambda value: str(value or "default"),
            append_channel_event=lambda **kwargs: kwargs,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            truncate_one_line=lambda text, limit: str(text)[:limit],
            json_safe=lambda value: value,
            dead_letter_lock=object(),
            read_dead_letter_json=lambda path, default: default,
            write_dead_letter_json=lambda path, payload: payload,
            dead_letter_file="/tmp/dead.json",
            dead_letter_limit=100,
            collapse_whitespace=lambda text: " ".join(str(text).split()),
            telegram_workspace_id="default",
            whatsapp_workspace_id="default",
            telegram_service_registry=lambda: _FakeRegistryDeps(),
            whatsapp_service_registry=lambda: _FakeRegistryDeps(),
            autopilot_profile_service=lambda: _FakeProfileService(),
            init_runtime=lambda: None,
            telegram_terminal_service=lambda: {"terminal": True},
            telegram_enabled_getter=lambda: True,
            telegram_default_profile_getter=lambda: "ops",
            telegram_catalog_getter=lambda: {"ops": {}},
            whatsapp_enabled_getter=lambda: True,
            whatsapp_default_profile_getter=lambda: "support",
            whatsapp_catalog_getter=lambda: {"support": {}},
            telegram_state_getter=lambda: {"active": True},
            telegram_lock_getter=lambda: object(),
            safe_path_token=lambda value: f"safe:{value}",
            build_goal_with_profile=lambda goal, profile: f"{goal}|{profile}",
            workspace_connector_context=lambda goal, workspace_id, connector_id: {
                "goal": goal,
                "workspace_id": workspace_id,
                "connector_id": connector_id,
            },
            extract_message=lambda update: update.get("message"),
            build_goal_with_attachments=lambda goal, attachments: f"{goal}|{len(attachments)}",
            route_message=lambda text, profile: {"text": text, "profile": profile},
            parse_form_urlencoded=lambda raw: {"Body": raw.decode("utf-8")},
            forbidden_response=lambda content: {"forbidden": content},
            webhook_enabled_getter=lambda: True,
            configured_webhook_secret_getter=lambda: "secret-1",
            bridge_registry_class=_FakeBridgeRegistry,
        )

        first = service.bridge_registry_service()
        second = service.bridge_registry_service()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeBridgeRegistry.instances), 1)
        self.assertEqual(service.autopilot_status_service(), {"status": True})
        self.assertEqual(service.autopilot_event_service(), {"event": True})
        self.assertEqual(service.event_bridge_service(), {"event_bridge": True})
        self.assertEqual(service.terminal_bridge_service(), {"terminal_bridge": True})
        self.assertEqual(service.state_bridge_service(), {"state_bridge": True})
        self.assertEqual(service.compatibility_bridge_service(), {"compatibility_bridge": True})
        self.assertEqual(service.webhook_bridge_service(), {"webhook_bridge": True})
        self.assertTrue(first.kwargs["telegram_enabled"])
        self.assertEqual(first.kwargs["telegram_default_profile"], "ops")
        self.assertEqual(first.kwargs["configured_webhook_secret"], "secret-1")


if __name__ == "__main__":
    unittest.main()
