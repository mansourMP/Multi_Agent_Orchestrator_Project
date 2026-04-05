import unittest

from server_modules import direct_chat_tool_catalog_service as service


def _callbacks() -> service.DirectChatToolPolicyCallbacks:
    return service.DirectChatToolPolicyCallbacks(
        compact_text=lambda value: " ".join(str(value or "").strip().lower().split()),
        question_like=lambda compact: compact.startswith(("what ", "why ", "how ", "can ")),
        mentions_any=lambda compact, keywords: any(token in compact for token in keywords),
        extract_first_path_reference=lambda message: "/tmp/demo.txt" if "/tmp/demo.txt" in str(message or "") else "",
        extract_first_url=lambda message: "https://example.com" if "example.com" in str(message or "") else "",
        provider_supports_direct_tool_calls=service.provider_supports_direct_tool_calls,
        is_obvious_smtp_write_request=lambda compact: "email" in compact and "send" in compact,
        google_workspace_keywords=("gmail", "calendar", "drive"),
        smtp_keywords=("smtp",),
        telegram_keywords=("telegram",),
        slack_keywords=("slack",),
        discord_keywords=("discord",),
        dropbox_keywords=("dropbox",),
        s3_keywords=("s3",),
        browser_keywords=("browser", "go to", "page title"),
        local_file_keywords=("read file", "open file"),
        local_shell_keywords=("run command", "shell"),
        local_screenshot_keywords=("screenshot",),
        local_computer_control_keywords=("click screen", "ocr screen"),
        web_lookup_keywords=("search web", "look up"),
        http_request_keywords=("http", "api request"),
        image_generation_keywords=("generate image",),
        llm_task_keywords=("think deeply",),
    )


class DirectChatToolCatalogServiceTests(unittest.TestCase):
    def test_build_local_direct_chat_tools_requires_local_worker(self) -> None:
        self.assertEqual(
            service.build_local_direct_chat_tools({"runtime_ok": False}, local_worker_available=lambda availability: False),
            [],
        )
        tools = service.build_local_direct_chat_tools({"runtime_ok": True}, local_worker_available=lambda availability: True)
        self.assertTrue(any(item["name"] == "file__read" for item in tools))
        self.assertTrue(any(item["name"] == "computer__click" for item in tools))

    def test_build_direct_chat_tools_uses_normalized_usable_write_actions(self) -> None:
        tools = service.build_direct_chat_tools(
            [
                {"id": " Slack ", "label": "Slack", "runtime_usable": True, "write_actions": [" post_message ", "post_message"]},
                {"id": "dropbox", "label": "Dropbox", "runtime_usable": False, "write_actions": ["upload_file"]},
            ]
        )

        self.assertEqual([item["name"] for item in tools], ["slack__post_message"])

    def test_message_can_use_direct_local_tools_detects_file_request(self) -> None:
        allowed = service.message_can_use_direct_local_tools(
            "Open /tmp/demo.txt",
            provider="codex_cli",
            tools=[{"name": "file__read"}],
            callbacks=_callbacks(),
        )

        self.assertTrue(allowed)

    def test_message_can_use_builtin_direct_tools_detects_browser_and_http_cases(self) -> None:
        callbacks = _callbacks()
        self.assertTrue(
            service.message_can_use_builtin_direct_tools(
                "Go to https://example.com and tell me the page title",
                tools=[{"name": "browser__navigate"}],
                callbacks=callbacks,
            )
        )
        self.assertTrue(
            service.message_can_use_builtin_direct_tools(
                "Make an HTTP request to https://example.com/api",
                tools=[{"name": "http_request"}],
                callbacks=callbacks,
            )
        )

    def test_message_can_use_direct_connector_tools_detects_workspace_connector(self) -> None:
        callbacks = _callbacks()
        allowed = service.message_can_use_direct_connector_tools(
            "Send a telegram message",
            provider="codex_cli",
            tools=[{"name": "telegram_bot__send_message"}],
            callbacks=callbacks,
        )

        self.assertTrue(allowed)


if __name__ == "__main__":
    unittest.main()
