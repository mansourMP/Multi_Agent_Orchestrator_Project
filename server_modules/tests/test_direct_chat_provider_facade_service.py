import unittest

from server_modules import direct_chat_provider_facade_service as service


class DirectChatProviderFacadeServiceTests(unittest.TestCase):
    def test_normalize_reasoning_effort_accepts_known_levels(self) -> None:
        self.assertEqual(service.normalize_reasoning_effort(" high "), "high")
        self.assertIsNone(service.normalize_reasoning_effort("turbo"))

    def test_direct_chat_error_reply_formats_iteration_limit(self) -> None:
        reply = service.direct_chat_error_reply(
            "max_tool_iterations_reached:17",
            chat_iteration_limit_reply_fn=lambda limit: f"limit {limit}",
            safe_positive_int_fn=lambda value, default: int(value) if str(value).isdigit() else default,
            chat_max_iterations_default=30,
        )

        self.assertEqual(reply, "limit 17")

    def test_provider_unavailable_response_delegates(self) -> None:
        payload = service.provider_unavailable_response(
            "openai",
            connect_action_fn=lambda label, href: {"label": label, "href": href},
        )

        self.assertEqual(payload["mode"], "connect")
        self.assertEqual(payload["actions"][0]["href"], "/connect-ai")


if __name__ == "__main__":
    unittest.main()
