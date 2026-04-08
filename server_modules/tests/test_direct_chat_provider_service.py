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
        self.assertEqual(payload["reply"], "")
        self.assertEqual(payload["interventions"][0]["kind"], "connect_required")
        self.assertEqual(payload["interventions"][0]["title"], "Workspace AI account is not ready")
        self.assertEqual(payload["actions"], [{"label": "Connect", "href": "/connect-ai"}])

    def test_resolve_provider_for_direct_chat_message_forces_codex_for_connector_heavy_requests(self) -> None:
        provider, credentials = direct_chat_provider_service.resolve_provider_for_direct_chat_message(
            "default",
            "openai",
            "Send a Slack message to the team",
            tools_present=True,
            preferred_provider_fn=lambda _workspace_id, _requested_provider: ("openai", {"api_key": "sk-test"}),
            direct_chat_credentials_fn=lambda _workspace_id, provider: {"oauth_token": "token"} if provider == "codex_cli" else {},
            supports_direct_message_native_chat_fn=lambda provider, credentials: provider == "codex_cli" and bool(credentials),
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, keywords: any(keyword in text for keyword in keywords),
            message_requests_local_file_tool_fn=lambda _message: False,
            message_requests_local_shell_tool_fn=lambda _message: False,
            message_requests_local_screenshot_tool_fn=lambda _message: False,
            message_requests_local_computer_tool_fn=lambda _message: False,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertEqual(provider, "codex_cli")
        self.assertEqual(credentials, {"oauth_token": "token"})

    def test_resolve_provider_for_direct_chat_message_keeps_preferred_provider_when_codex_unavailable(self) -> None:
        provider, credentials = direct_chat_provider_service.resolve_provider_for_direct_chat_message(
            "default",
            "openai",
            "Take a screenshot of the current page",
            tools_present=True,
            preferred_provider_fn=lambda _workspace_id, _requested_provider: ("openai", {"api_key": "sk-test"}),
            direct_chat_credentials_fn=lambda _workspace_id, _provider: {},
            supports_direct_message_native_chat_fn=lambda _provider, _credentials: False,
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, keywords: any(keyword in text for keyword in keywords),
            message_requests_local_file_tool_fn=lambda _message: False,
            message_requests_local_shell_tool_fn=lambda _message: False,
            message_requests_local_screenshot_tool_fn=lambda _message: True,
            message_requests_local_computer_tool_fn=lambda _message: False,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertEqual(provider, "openai")
        self.assertEqual(credentials, {"api_key": "sk-test"})


if __name__ == "__main__":
    unittest.main()
