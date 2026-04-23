import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server_modules import (
    auth,
    gateway_pairing_service,
    gateway_state_repository,
    personal_channels_repository,
    personal_channels_service,
    routes_connectors,
)


class PersonalVsStudioRuntimeIsolationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.gateway_db_path = Path(self.tmpdir.name) / "gateway-state.sqlite3"
        self.auth_db_path = Path(self.tmpdir.name) / "auth-users.sqlite3"
        self.personal_channels_db_path = Path(self.tmpdir.name) / "personal-channels.sqlite3"
        self.runtime_state_db_path = Path(self.tmpdir.name) / "runtime-state.sqlite3"

        gateway_state_repository.init_gateway_state_db(self.gateway_db_path)
        personal_channels_repository.init_personal_channels_db(self.personal_channels_db_path)

        self.patchers = [
            patch.object(gateway_state_repository, "GATEWAY_STATE_DB_FILE", self.gateway_db_path),
            patch.object(auth, "AUTH_DB_FILE", self.auth_db_path),
            patch.object(personal_channels_repository, "PERSONAL_CHANNELS_DB_FILE", self.personal_channels_db_path),
            patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(self.runtime_state_db_path)}, clear=False),
        ]
        for patcher in self.patchers:
            patcher.start()

        self.app = FastAPI()
        self.app.include_router(routes_connectors.router, prefix="/api")
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def tearDown(self) -> None:
        self.client.close()
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.tmpdir.cleanup()

    def test_connector_failure_does_not_poison_personal_gateway_inbound_flow(self) -> None:
        pairing = gateway_pairing_service.create_gateway_pairing_intent(
            tenant_id="tenant-1",
            workspace_id="default",
            user_id="user-1",
        )
        registration = gateway_pairing_service.register_gateway(
            pairing_token=pairing["pairing_token"],
            device_id="device-local-1",
            gateway_id="gateway-local-1",
            display_name="Mansur Mac",
            platform="macos-arm64",
            capabilities=["channel.whatsapp.personal"],
        )

        with patch(
            "server_modules.connectors_actions.whatsapp_twilio_webhook",
            new=AsyncMock(side_effect=RuntimeError("studio_connector_failure")),
        ):
            connector_failure = self.client.post("/api/channels/whatsapp/twilio/webhook")
        self.assertEqual(connector_failure.status_code, 500)

        with (
            patch(
                "server_modules.personal_channel_sage_bridge_service.build_whatsapp_personal_reply",
                return_value={"text": "Sage personal reply", "source": "test_bridge"},
            ),
            patch(
                "server_modules.gateway_protocol_service.dispatch_channel_outbound",
                new=AsyncMock(return_value={"external_message_id": "wa-out-1"}),
            ),
        ):
            personal_result = asyncio.run(
                personal_channels_service.handle_gateway_channel_inbound(
                    gateway_id="gateway-local-1",
                    registration=registration,
                    payload={
                        "channel_key": "whatsapp_personal",
                        "provider": "whatsapp_baileys",
                        "message": {
                            "external_message_id": "wa-in-1",
                            "remote_jid": "15551234567@s.whatsapp.net",
                            "sender_jid": "15551234567@s.whatsapp.net",
                            "push_name": "Mansur",
                            "text": "hello from personal whatsapp",
                            "received_at": "2026-04-22T16:00:00Z",
                            "from_me": False,
                        },
                    },
                )
            )

        self.assertFalse(personal_result["duplicate"])
        self.assertEqual(personal_result["outbound"]["status"], "delivered")
        recent_messages = personal_channels_repository.list_recent_gateway_messages(
            "gateway-local-1",
            channel_key="whatsapp_personal",
        )
        self.assertEqual(len(recent_messages["inbound"]), 1)
        self.assertEqual(len(recent_messages["outbound"]), 1)
        self.assertEqual(recent_messages["outbound"][0]["status"], "delivered")


if __name__ == "__main__":
    unittest.main()
