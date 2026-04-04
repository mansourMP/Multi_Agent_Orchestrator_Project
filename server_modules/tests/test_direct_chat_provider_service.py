import unittest

from server_modules import direct_chat_provider_service


class DirectChatProviderServiceTests(unittest.TestCase):
    def test_preferred_provider_maps_openai_oauth_to_codex_cli(self) -> None:
        def fake_credentials(_workspace_id: str, provider: str) -> dict[str, str]:
            if provider == "openai":
                return {"auth_mode": "oauth_token", "oauth_token": "token"}
            if provider == "codex_cli":
                return {"auth_mode": "oauth_token", "oauth_token": "token"}
            return {}

        def fake_support(provider: str, credentials: dict[str, str] | None) -> bool:
            return provider == "codex_cli" and bool(credentials)

        provider, credentials = direct_chat_provider_service.preferred_provider(
            "default",
            "openai",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=fake_credentials,
            supports_direct_message_native_chat_fn=fake_support,
            credential_auth_mode_fn=lambda _provider, credentials: str((credentials or {}).get("auth_mode") or ""),
        )

        self.assertEqual(provider, "codex_cli")
        self.assertEqual(credentials.get("auth_mode"), "oauth_token")

    def test_preferred_provider_maps_openai_codex_token_to_codex_cli(self) -> None:
        def fake_credentials(_workspace_id: str, provider: str) -> dict[str, str]:
            if provider == "openai":
                return {"credential_type": "codex_token", "access_token": "token"}
            if provider == "codex_cli":
                return {"auth_mode": "oauth_token", "oauth_token": "token"}
            return {}

        def fake_support(provider: str, credentials: dict[str, str] | None) -> bool:
            return provider == "codex_cli" and bool(credentials)

        provider, credentials = direct_chat_provider_service.preferred_provider(
            "default",
            "openai",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=fake_credentials,
            supports_direct_message_native_chat_fn=fake_support,
            credential_auth_mode_fn=lambda _provider, credentials: str((credentials or {}).get("auth_mode") or ""),
        )

        self.assertEqual(provider, "codex_cli")
        self.assertEqual(credentials.get("auth_mode"), "oauth_token")

    def test_resolve_direct_chat_availability_uses_override_and_default_tools(self) -> None:
        payload = direct_chat_provider_service.resolve_direct_chat_availability(
            "workspace-a",
            "openai",
            direct_chat_runtime_available_fn=lambda: True,
            preferred_provider_fn=lambda workspace_id, requested: (requested or "openai", {"api_key": "sk-test"}),
            supports_direct_message_native_chat_fn=lambda _provider, credentials: bool(credentials),
            resolve_workspace_tool_capabilities_fn=lambda workspace_id: [{"id": "gmail", "workspace_id": workspace_id}],
            availability_override={"runtime_ok": False, "custom": "value"},
        )

        self.assertEqual(payload["provider"], "openai")
        self.assertTrue(payload["ai_ready"])
        self.assertFalse(payload["runtime_ok"])
        self.assertEqual(payload["custom"], "value")
        self.assertEqual(payload["tool_capabilities"], [{"id": "gmail", "workspace_id": "workspace-a"}])

    def test_connected_provider_tokens_filters_empty_credentials(self) -> None:
        connected = direct_chat_provider_service.connected_provider_tokens(
            "default",
            supported_providers=["openai", "anthropic", "gemini"],
            direct_chat_credentials_fn=lambda _workspace_id, provider: {"api_key": "sk-test"} if provider != "gemini" else {},
        )

        self.assertEqual(connected, ["openai", "anthropic"])

    def test_provider_unavailable_response_uses_connect_action(self) -> None:
        payload = direct_chat_provider_service.provider_unavailable_response(
            "codex_cli",
            connect_action=lambda label, href: {"label": label, "href": href},
        )

        self.assertEqual(payload["mode"], "connect")
        self.assertIn("not ready", payload["reply"])
        self.assertEqual(payload["actions"], [{"label": "Connect", "href": "/connect-ai"}])


if __name__ == "__main__":
    unittest.main()
