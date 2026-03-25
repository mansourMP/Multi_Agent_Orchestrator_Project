import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from server_modules import auth, runtime_common


def _request(path: str = "/test", query_string: bytes = b"") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": query_string,
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


class AuthHardeningTests(unittest.TestCase):
    def test_extract_request_api_key_ignores_query_string(self):
        request = _request(query_string=b"api_key=leaked")
        self.assertEqual(runtime_common._extract_request_api_key(request), "")

    def test_public_registration_disabled_dependency_blocks_when_off(self):
        with patch.object(auth, "ORION_PUBLIC_REGISTRATION_ENABLED", False):
            with self.assertRaises(HTTPException) as ctx:
                auth.ensure_public_registration_enabled()
        self.assertEqual(ctx.exception.status_code, 404)

    def test_require_admin_access_allows_service_key_identity(self):
        request = _request()
        with patch("server_modules.auth.get_current_user", return_value={"user_id": "service", "auth_type": "api_key"}):
            result = auth.require_admin_access(request=request)
        self.assertTrue(result["is_admin"])

    def test_require_admin_access_blocks_non_admin_bearer_identity(self):
        request = _request()
        with patch("server_modules.auth.get_current_user", return_value={"user_id": "user-1", "auth_type": "bearer", "email": "user@example.com"}):
            with self.assertRaises(HTTPException) as ctx:
                auth.require_admin_access(request=request)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
