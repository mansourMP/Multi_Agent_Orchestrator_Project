import unittest
from unittest.mock import patch
import os

from fastapi import HTTPException
from starlette.requests import Request

from server_modules import auth, runtime_common
from server_modules import db as runtime_db
from server_modules import routes_connectors


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
    def setUp(self):
        auth.USER_RATE_LIMIT_BUCKETS.clear()
        auth.LOGIN_RATE_LIMIT_BUCKETS.clear()

    def test_get_current_user_rejects_missing_auth_when_enabled(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "1"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                auth.get_current_user(request=request)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_auth_remains_required_when_api_key_is_configured(self):
        with patch.dict(os.environ, {"ORION_API_KEY": "secret"}, clear=False):
            self.assertTrue(auth._orion_auth_required())

    def test_get_current_user_accepts_matching_api_key_when_auth_enabled(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_API_KEY": "secret", "ORION_AUTH_REQUIRED": "1"}, clear=False):
            user = auth.get_current_user(request=request, x_api_key="secret")
        self.assertEqual(user["auth_type"], "api_key")
        self.assertEqual(user["user_id"], "service")

    def test_service_api_key_uses_separate_higher_rate_limit_budget(self):
        request = _request()
        with patch.object(auth, "ORION_SERVICE_RATE_LIMIT_PER_MINUTE", 2), patch("server_modules.auth._orion_api_key", return_value="secret"):
            auth.get_current_user(request=request, x_api_key="secret")
            auth.get_current_user(request=request, x_api_key="secret")
            with self.assertRaises(HTTPException) as ctx:
                auth.get_current_user(request=request, x_api_key="secret")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_extract_request_api_key_ignores_query_string(self):
        request = _request(query_string=b"api_key=leaked")
        self.assertEqual(runtime_common._extract_request_api_key(request), "")

    def test_public_registration_disabled_dependency_blocks_when_off(self):
        with patch.dict(os.environ, {"ORION_PUBLIC_REGISTRATION_ENABLED": "0"}, clear=False):
            with patch.object(auth, "ORION_PUBLIC_REGISTRATION_ENABLED", False):
                with self.assertRaises(HTTPException) as ctx:
                    auth.ensure_public_registration_enabled()
        self.assertEqual(ctx.exception.status_code, 404)

    def test_require_admin_access_allows_service_key_identity(self):
        request = _request()
        with patch("server_modules.auth.get_current_user", return_value={"user_id": "service", "auth_type": "api_key"}):
            result = auth.require_admin_access(request=request)
        self.assertTrue(result["is_admin"])
        self.assertEqual(result["role"], "owner")

    def test_require_api_key_returns_scoped_local_dev_identity_when_auth_disabled(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0"}, clear=False):
            user = runtime_common.require_api_key(request=request)
        self.assertEqual(user["auth_type"], "local_dev")
        self.assertEqual(user["user_id"], "local-dev")
        self.assertEqual(user["role"], "member")
        self.assertFalse(user["is_admin"])
        self.assertEqual(user["workspace_ids"], ["default"])
        self.assertEqual(auth.current_user_role(user), "member")

    def test_auth_disabled_fails_closed_in_production(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0", "ENV": "production"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                runtime_common.require_api_key(request=request)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_auth_disabled_fails_closed_when_orion_env_marks_production(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0", "ORION_ENV": "production"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                runtime_common.require_api_key(request=request)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_database_url_does_not_backfill_from_backend_env_in_production(self):
        with (
            patch.dict(os.environ, {"ORION_ENV": "production"}, clear=True),
            patch.object(runtime_db, "_ENV_DSN_LOADED", False),
        ):
            self.assertEqual(runtime_db.configured_database_url(), "")

    def test_runtime_config_only_loads_dotenv_in_explicit_local_dev(self):
        with patch.dict(os.environ, {"ORION_ENV": "production"}, clear=True):
            self.assertFalse(runtime_common.config._should_load_dotenv())
        with patch.dict(os.environ, {"ORION_ENV": "development"}, clear=True):
            self.assertTrue(runtime_common.config._should_load_dotenv())

    def test_require_member_api_key_accepts_local_dev_member_identity(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0"}, clear=False):
            user = runtime_common.require_member_api_key(request=request)
        self.assertEqual(user["auth_type"], "local_dev")
        self.assertEqual(user["role"], "member")
        self.assertFalse(user["is_admin"])

    def test_require_api_key_respects_local_dev_identity_overrides(self):
        request = _request()
        with patch.dict(
            os.environ,
            {
                "ORION_AUTH_REQUIRED": "0",
                "ORION_LOCAL_DEV_AUTH_ROLE": "viewer",
                "ORION_LOCAL_DEV_USER_ID": "dev-user-1",
                "ORION_LOCAL_DEV_EMAIL": "Dev.User@Example.com",
            },
            clear=False,
        ):
            user = runtime_common.require_api_key(request=request)
        self.assertEqual(user["auth_type"], "local_dev")
        self.assertEqual(user["user_id"], "dev-user-1")
        self.assertEqual(user["email"], "dev.user@example.com")
        self.assertEqual(user["role"], "viewer")
        self.assertFalse(user["is_admin"])

    def test_require_admin_api_key_blocks_local_dev_member_identity(self):
        request = _request()
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                runtime_common.require_admin_api_key(request=request)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_require_admin_api_key_allows_explicit_local_dev_owner_identity(self):
        request = _request()
        with patch.dict(
            os.environ,
            {"ORION_AUTH_REQUIRED": "0", "ORION_LOCAL_DEV_AUTH_ROLE": "owner", "ORION_LOCAL_DEV_WORKSPACE_IDS": "default"},
            clear=False,
        ):
            user = runtime_common.require_admin_api_key(request=request)
        self.assertEqual(user["auth_type"], "local_dev")
        self.assertEqual(user["role"], "owner")
        self.assertTrue(user["is_admin"])

    def test_require_admin_access_blocks_non_admin_bearer_identity(self):
        request = _request()
        with patch("server_modules.auth.get_current_user", return_value={"user_id": "user-1", "auth_type": "bearer", "email": "user@example.com"}):
            with self.assertRaises(HTTPException) as ctx:
                auth.require_admin_access(request=request)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_get_current_user_defaults_bearer_role_to_member(self):
        request = _request()
        token = auth.issue_token("user-1", email="user@example.com")
        user = auth.get_current_user(request=request, authorization=f"Bearer {token}")
        self.assertEqual(user["role"], "member")
        self.assertFalse(user["is_admin"])

    def test_get_current_user_respects_viewer_role_claim(self):
        request = _request()
        token = auth.issue_token("viewer-1", email="viewer@example.com", role="viewer")
        user = auth.get_current_user(request=request, authorization=f"Bearer {token}")
        self.assertEqual(user["role"], "viewer")
        self.assertFalse(user["is_admin"])

    def test_get_current_user_elevates_admin_allowlist_to_owner(self):
        request = _request()
        token = auth.issue_token("admin-1", email="admin@example.com", role="member")
        with patch.object(auth, "ORION_ADMIN_USER_IDS", {"admin-1"}), patch.object(auth, "ORION_ADMIN_EMAILS", set()):
            user = auth.get_current_user(request=request, authorization=f"Bearer {token}")
        self.assertEqual(user["role"], "owner")
        self.assertTrue(user["is_admin"])


class ConnectorRouteAuthHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def test_credentials_vault_route_blocks_default_local_dev_member(self):
        request = _request(path="/credentials/vault", query_string=b"workspace_id=default")
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0"}, clear=False):
            current_user = runtime_common.require_api_key(request=request)
            with self.assertRaises(HTTPException) as ctx:
                await routes_connectors.list_credentials_vault(request=request, current_user=current_user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_credentials_vault_route_allows_explicit_scoped_local_dev_owner(self):
        request = _request(path="/credentials/vault", query_string=b"workspace_id=default")
        with (
            patch.dict(
                os.environ,
                {"ORION_AUTH_REQUIRED": "0", "ORION_LOCAL_DEV_AUTH_ROLE": "owner", "ORION_LOCAL_DEV_WORKSPACE_IDS": "default"},
                clear=False,
            ),
            patch("server_modules.routes_connectors.core.list_credentials_vault", return_value={"items": []}) as list_mock,
        ):
            current_user = runtime_common.require_api_key(request=request)
            result = await routes_connectors.list_credentials_vault(request=request, current_user=current_user)
        self.assertEqual(result, {"items": []})
        list_mock.assert_called_once_with(workspace_id="default")

    async def test_credentials_vault_route_rejects_unscoped_local_dev_workspace(self):
        request = _request(path="/credentials/vault", query_string=b"workspace_id=other")
        with patch.dict(os.environ, {"ORION_AUTH_REQUIRED": "0"}, clear=False):
            current_user = runtime_common.require_api_key(request=request)
            with self.assertRaises(HTTPException) as ctx:
                await routes_connectors.list_credentials_vault(request=request, current_user=current_user)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
