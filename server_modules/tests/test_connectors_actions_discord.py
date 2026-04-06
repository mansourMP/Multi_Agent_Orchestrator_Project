from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from starlette.requests import Request

from server_modules import connectors_actions


def _request(payload: dict, *, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    body = json.dumps(payload).encode("utf-8")

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


class DiscordWebhookCanonicalizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_discord_webhook_passes_canonical_run_start_callbacks(self):
        request = _request({"id": "evt-1"})
        captured: dict[str, object] = {}

        def _fake_dispatch(parsed, **kwargs):
            captured["parsed"] = parsed
            captured["kwargs"] = kwargs
            return {"ok": True, "triggered": True, "run_id": "run-123"}

        with (
            patch("server_modules.connectors_actions.load_vault", return_value={"credentials": [{"id": "cred-discord", "provider": "discord_bot", "workspace_id": "default", "metadata": {}}]}),
            patch("server_modules.connectors_actions.resolve_vault_credential", return_value={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"}),
            patch("server_modules.connectors_actions.discord_parse_inbound_event", return_value={"kind": "event", "event_type": "message"}),
            patch("server_modules.connectors_actions.discord_event_matches_connector", return_value=True),
            patch("server_modules.connectors_actions.discord_dispatch_inbound_event", side_effect=_fake_dispatch),
        ):
            result = await connectors_actions.discord_webhook(request)

        self.assertEqual(result["triggered"], 1)
        kwargs = captured["kwargs"]
        self.assertTrue(callable(kwargs["run_start_request_class"]))
        self.assertTrue(callable(kwargs["start_run_request"]))
        self.assertTrue(callable(kwargs["create_run_fn"]))
        run_request = kwargs["run_start_request_class"](engine="orion", workspace_id="default", user_goal="hello")
        self.assertEqual(run_request.workspace_id, "default")
        self.assertEqual(run_request.user_goal, "hello")
