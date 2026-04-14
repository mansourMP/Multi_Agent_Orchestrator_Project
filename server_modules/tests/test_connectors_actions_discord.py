from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from nacl.signing import SigningKey
from starlette.requests import Request

from server_modules import connectors_actions


def _body_bytes(payload: dict) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _request_from_body(body: bytes, *, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    async def _receive() -> dict:
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/connectors/discord/webhook",
        "raw_path": b"/connectors/discord/webhook",
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 54321),
        "server": ("127.0.0.1", 8001),
    }
    return Request(scope, _receive)


def _signed_headers(body: bytes, signing_key: SigningKey, *, timestamp: str = "1700000000") -> list[tuple[bytes, bytes]]:
    signature = signing_key.sign(timestamp.encode("utf-8") + body).signature.hex()
    return [
        (b"x-signature-ed25519", signature.encode("utf-8")),
        (b"x-signature-timestamp", timestamp.encode("utf-8")),
    ]


class DiscordWebhookCanonicalizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_discord_webhook_rejects_missing_signature_headers(self):
        request = _request_from_body(_body_bytes({"id": "evt-1"}))

        with (
            patch("server_modules.connectors_actions.load_vault") as load_vault,
            patch("server_modules.connectors_actions.discord_parse_inbound_event") as parse_event,
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event") as dispatch_event,
        ):
            with self.assertRaises(HTTPException) as exc_info:
                await connectors_actions.discord_webhook(request)

        self.assertEqual(exc_info.exception.status_code, 401)
        load_vault.assert_not_called()
        parse_event.assert_not_called()
        dispatch_event.assert_not_called()

    async def test_discord_webhook_rejects_invalid_signature(self):
        payload = {"id": "evt-1"}
        signing_key = SigningKey.generate()
        configured_key = SigningKey.generate()
        body = _body_bytes(payload)
        request = _request_from_body(body, headers=_signed_headers(body, signing_key))

        with (
            patch.dict(os.environ, {"DISCORD_APP_PUBLIC_KEY": configured_key.verify_key.encode().hex()}),
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": []}),
            patch("server_modules.connectors_actions.discord_parse_inbound_event") as parse_event,
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event") as dispatch_event,
        ):
            with self.assertRaises(HTTPException) as exc_info:
                await connectors_actions.discord_webhook(request)

        self.assertEqual(exc_info.exception.status_code, 401)
        parse_event.assert_not_called()
        dispatch_event.assert_not_called()

    async def test_discord_webhook_rejects_when_public_key_is_not_configured(self):
        payload = {"id": "evt-1"}
        signing_key = SigningKey.generate()
        body = _body_bytes(payload)
        request = _request_from_body(body, headers=_signed_headers(body, signing_key))

        with (
            patch.dict(os.environ, {"DISCORD_APP_PUBLIC_KEY": ""}),
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": []}),
            patch("server_modules.connectors_actions.discord_parse_inbound_event") as parse_event,
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event") as dispatch_event,
        ):
            with self.assertRaises(HTTPException) as exc_info:
                await connectors_actions.discord_webhook(request)

        self.assertEqual(exc_info.exception.status_code, 503)
        parse_event.assert_not_called()
        dispatch_event.assert_not_called()

    async def test_discord_webhook_accepts_valid_signed_ping(self):
        signing_key = SigningKey.generate()
        body = _body_bytes({"type": 1})
        request = _request_from_body(body, headers=_signed_headers(body, signing_key))

        with (
            patch.dict(os.environ, {"DISCORD_APP_PUBLIC_KEY": signing_key.verify_key.encode().hex()}),
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": []}),
        ):
            result = await connectors_actions.discord_webhook(request)

        self.assertEqual(result, {"type": 1})

    async def test_discord_webhook_verified_request_can_stop_before_run_creation(self):
        signing_key = SigningKey.generate()
        body = _body_bytes({"id": "evt-2"})
        request = _request_from_body(body, headers=_signed_headers(body, signing_key))
        connector_row = {"id": "cred-discord", "provider": "discord_bot", "workspace_id": "default", "metadata": {}}

        with (
            patch.dict(os.environ, {"DISCORD_APP_PUBLIC_KEY": ""}),
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": [connector_row]}),
            patch(
                "server_modules.connectors_actions.resolve_vault_credential",
                return_value={
                    "application_public_key": signing_key.verify_key.encode().hex(),
                    "bot_token": "discord-token",
                    "channel_id": "123",
                    "guild_id": "456",
                },
            ),
            patch("server_modules.connectors_actions.discord_parse_inbound_event", return_value={"kind": "event", "event_type": "message"}),
            patch("server_modules.connectors_actions.discord_event_matches_connector", return_value=False),
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event") as dispatch_event,
        ):
            result = await connectors_actions.discord_webhook(request)

        self.assertEqual(result, {"ok": True, "handled": 0, "triggered": 0})
        dispatch_event.assert_not_called()

    async def test_discord_webhook_passes_canonical_run_start_callbacks(self):
        signing_key = SigningKey.generate()
        body = _body_bytes({"id": "evt-1"})
        request = _request_from_body(body, headers=_signed_headers(body, signing_key))
        captured: dict[str, object] = {}
        connector_row = {"id": "cred-discord", "provider": "discord_bot", "workspace_id": "default", "metadata": {}}

        def _fake_dispatch(parsed, **kwargs):
            captured["parsed"] = parsed
            captured["kwargs"] = kwargs
            return {"ok": True, "triggered": True, "run_id": "run-123"}

        with (
            patch.dict(os.environ, {"DISCORD_APP_PUBLIC_KEY": ""}),
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": [connector_row]}),
            patch(
                "server_modules.connectors_actions.resolve_vault_credential",
                return_value={
                    "application_public_key": signing_key.verify_key.encode().hex(),
                    "bot_token": "discord-token",
                    "channel_id": "123",
                    "guild_id": "456",
                },
            ),
            patch("server_modules.connectors_actions.discord_parse_inbound_event", return_value={"kind": "event", "event_type": "message"}),
            patch("server_modules.connectors_actions.discord_event_matches_connector", return_value=True),
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event", side_effect=_fake_dispatch),
        ):
            result = await connectors_actions.discord_webhook(request)

        self.assertEqual(result["triggered"], 1)
        kwargs = captured["kwargs"]
        self.assertTrue(callable(kwargs["run_start_request_class"]))
        self.assertTrue(callable(kwargs["start_run_request"]))
        self.assertNotIn("create_run_fn", kwargs)
        run_request = kwargs["run_start_request_class"](engine="orion", workspace_id="default", user_goal="hello")
        self.assertEqual(run_request.workspace_id, "default")
        self.assertEqual(run_request.user_goal, "hello")
