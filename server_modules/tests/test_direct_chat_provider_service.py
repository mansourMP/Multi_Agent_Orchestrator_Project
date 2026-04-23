import unittest

from server_modules import direct_chat_provider_service


class DirectChatProviderServiceTests(unittest.TestCase):
    def test_direct_chat_credentials_falls_back_to_runtime_candidates_when_workspace_only_is_empty(self) -> None:
        calls: list[tuple[dict[str, object], str]] = []

        def fake_candidates(_context: dict[str, object], metadata: dict[str, object], provider: str) -> list[dict[str, object]]:
            calls.append((dict(metadata), provider))
            if metadata.get("workspace_only"):
                return []
            return [{"credentials": {"auth_mode": "local_cli"}, "label": "local-claude-cli"}]

        credentials = direct_chat_provider_service.direct_chat_credentials(
            "workspace-a",
            "anthropic",
            build_provider_credential_candidates_fn=fake_candidates,
        )

        self.assertEqual(credentials, {"auth_mode": "local_cli"})
        self.assertEqual(calls, [({"source": "chat_direct", "workspace_only": True}, "anthropic"), ({"source": "chat_direct"}, "anthropic")])

    def test_preferred_provider_maps_openai_oauth_to_codex_cli_without_explicit_selection(self) -> None:
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
            "",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=fake_credentials,
            supports_direct_message_native_chat_fn=fake_support,
            credential_auth_mode_fn=lambda _provider, credentials: str((credentials or {}).get("auth_mode") or ""),
            provider_runtime_usable_fn=lambda _workspace_id, _provider: True,
        )

        self.assertEqual(provider, "codex_cli")
        self.assertEqual(credentials.get("auth_mode"), "oauth_token")

    def test_preferred_provider_maps_openai_codex_token_to_codex_cli_without_explicit_selection(self) -> None:
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
            "",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=fake_credentials,
            supports_direct_message_native_chat_fn=fake_support,
            credential_auth_mode_fn=lambda _provider, credentials: str((credentials or {}).get("auth_mode") or ""),
            provider_runtime_usable_fn=lambda _workspace_id, _provider: True,
        )

        self.assertEqual(provider, "codex_cli")
        self.assertEqual(credentials.get("auth_mode"), "oauth_token")

    def test_preferred_provider_keeps_explicit_selection_when_unavailable(self) -> None:
        provider, credentials = direct_chat_provider_service.preferred_provider(
            "default",
            "anthropic",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=lambda _workspace_id, provider: {"api_key": "sk-openai"} if provider == "openai" else {},
            supports_direct_message_native_chat_fn=lambda provider, credentials: provider == "openai" and bool(credentials),
            credential_auth_mode_fn=lambda _provider, credentials: str((credentials or {}).get("auth_mode") or ""),
        )

        self.assertEqual(provider, "anthropic")
        self.assertEqual(credentials, {})

    def test_preferred_provider_does_not_override_explicit_openai_to_codex_cli(self) -> None:
        def fake_credentials(_workspace_id: str, provider: str) -> dict[str, str]:
            if provider == "openai":
                return {"auth_mode": "oauth_token", "oauth_token": "token"}
            if provider == "codex_cli":
                return {"auth_mode": "oauth_token", "oauth_token": "token"}
            return {}

        provider, credentials = direct_chat_provider_service.preferred_provider(
            "default",
            "openai",
            supported_providers=["openai", "codex_cli", "anthropic", "gemini"],
            direct_chat_credentials_fn=fake_credentials,
            supports_direct_message_native_chat_fn=lambda _provider, _credentials: False,
            credential_auth_mode_fn=lambda _provider, creds: str((creds or {}).get("auth_mode") or ""),
        )

        self.assertEqual(provider, "openai")
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

    def test_resolve_direct_chat_availability_prefers_platform_mode_for_mobile(self) -> None:
        payload = direct_chat_provider_service.resolve_direct_chat_availability(
            "workspace-a",
            "openai",
            direct_chat_runtime_available_fn=lambda: True,
            preferred_provider_fn=lambda workspace_id, requested: (requested or "openai", {"api_key": "sk-test"}),
            supports_direct_message_native_chat_fn=lambda _provider, credentials: bool(credentials),
            resolve_workspace_tool_capabilities_fn=lambda _workspace_id: [],
            availability_override={"surface_channel": "mobile", "source": "mobile_chat"},
        )

        self.assertTrue(payload["runtime_ok"])
        self.assertEqual(payload["connection_mode"], "platform")

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

    def test_resolve_provider_for_direct_chat_message_forces_codex_for_connector_heavy_requests_without_explicit_selection(self) -> None:
        provider, credentials = direct_chat_provider_service.resolve_provider_for_direct_chat_message(
            "default",
            "",
            "Send a Slack message to the team",
            tools_present=True,
            preferred_provider_fn=lambda _workspace_id, _requested_provider: ("openai", {"api_key": "sk-test"}),
            direct_chat_credentials_fn=lambda _workspace_id, provider: {"oauth_token": "token"} if provider == "codex_cli" else {},
            supports_direct_message_native_chat_fn=lambda provider, credentials: provider == "codex_cli" and bool(credentials),
            provider_runtime_usable_fn=lambda _workspace_id, _provider: True,
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

    def test_resolve_provider_for_direct_chat_message_keeps_explicit_provider_for_connector_heavy_requests(self) -> None:
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

        self.assertEqual(provider, "openai")
        self.assertEqual(credentials, {"api_key": "sk-test"})

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
