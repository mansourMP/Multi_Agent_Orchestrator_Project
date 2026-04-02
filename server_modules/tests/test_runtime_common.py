from __future__ import annotations

import unittest
from unittest.mock import patch

from starlette.requests import Request

from server_modules import runtime_common


def _request(path: str, *, method: str = "POST", api_key: str = "test-key") -> Request:
    headers = [(b"host", b"127.0.0.1:8001")]
    if api_key:
        headers.append((b"x-api-key", api_key.encode("utf-8")))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 54321),
        "server": ("127.0.0.1", 8001),
    }
    return Request(scope)


class RuntimeCommonRateLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        with runtime_common.RATE_LIMIT_LOCK:
            runtime_common.RATE_LIMIT_BUCKETS.clear()

    def tearDown(self) -> None:
        with runtime_common.RATE_LIMIT_LOCK:
            runtime_common.RATE_LIMIT_BUCKETS.clear()

    def test_chat_respond_is_exempt_from_control_plane_rate_limit(self) -> None:
        with (
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", 0),
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_BURST", 0),
        ):
            first = runtime_common._control_plane_rate_limit(_request("/chat/respond"))
            second = runtime_common._control_plane_rate_limit(_request("/chat/respond"))

        self.assertIsNone(first)
        self.assertIsNone(second)

    def test_api_chat_respond_is_exempt_from_control_plane_rate_limit(self) -> None:
        with (
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", 0),
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_BURST", 0),
        ):
            first = runtime_common._control_plane_rate_limit(_request("/api/chat/respond"))
            second = runtime_common._control_plane_rate_limit(_request("/api/chat/respond"))

        self.assertIsNone(first)
        self.assertIsNone(second)

    def test_other_mutations_still_rate_limited(self) -> None:
        with (
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", 0),
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_BURST", 0),
        ):
            first = runtime_common._control_plane_rate_limit(_request("/skills/install"))
            second = runtime_common._control_plane_rate_limit(_request("/skills/install"))

        self.assertIsNone(first)
        self.assertIsNotNone(second)
        self.assertEqual(second.status_code, 429)


if __name__ == "__main__":
    unittest.main()
