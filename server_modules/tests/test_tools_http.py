import asyncio
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import tools_http


ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "operator_chat.py"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
spec = importlib.util.spec_from_file_location("operator_chat_http_tools_under_test", MODULE_PATH)
operator_chat = importlib.util.module_from_spec(spec)
sys.modules["operator_chat_http_tools_under_test"] = operator_chat
assert spec and spec.loader
spec.loader.exec_module(operator_chat)


class _FakeResponse:
    def __init__(self, *, status_code: int = 200, headers: dict | None = None, body: bytes = b"") -> None:
        self.status_code = status_code
        self.headers = headers or {}
        self._body = body

    async def aread(self) -> bytes:
        return self._body


class _FakeAsyncClient:
    response = _FakeResponse()
    last_request = None

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def request(self, **kwargs):
        type(self).last_request = kwargs
        return type(self).response


class HttpToolTests(unittest.TestCase):
    def test_get_request_no_approval(self):
        approval = operator_chat._build_direct_tool_approval_response(
            tool_calls=[
                {
                    "name": "http_request",
                    "arguments": json.dumps({"method": "GET", "url": "https://example.com/data"}),
                }
            ],
            tool_capabilities=[],
        )

        self.assertIsNone(approval)

        _FakeAsyncClient.response = _FakeResponse(
            status_code=200,
            headers={"content-type": "application/json"},
            body=b'{"ok": true}',
        )
        with patch("server_modules.tools_http.httpx.AsyncClient", _FakeAsyncClient):
            result = asyncio.run(
                tools_http.http_request(
                    method="GET",
                    url="https://example.com/data",
                )
            )

        self.assertEqual(result["status_code"], 200)
        self.assertEqual(result["body"], {"ok": True})

    def test_post_external_requires_approval(self):
        payload = operator_chat._build_direct_tool_approval_response(
            tool_calls=[
                {
                    "name": "http_request",
                    "arguments": json.dumps(
                        {
                            "method": "POST",
                            "url": "https://api.example.com/items",
                            "body": {"name": "widget"},
                        }
                    ),
                }
            ],
            tool_capabilities=[],
        )

        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["actions"][0]["connector"], "http")
        self.assertEqual(payload["actions"][0]["action"], "request")

    def test_response_truncated_at_100kb(self):
        _FakeAsyncClient.response = _FakeResponse(
            status_code=200,
            headers={"content-type": "text/plain"},
            body=b"a" * (tools_http.MAX_RESPONSE_BYTES + 64),
        )
        with patch("server_modules.tools_http.httpx.AsyncClient", _FakeAsyncClient):
            result = asyncio.run(
                tools_http.http_request(
                    method="GET",
                    url="https://example.com/large",
                )
            )

        self.assertTrue(result["truncated"])
        self.assertIn("[truncated:", result["body"])


if __name__ == "__main__":
    unittest.main()
