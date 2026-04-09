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

    def test_turn_is_exempt_from_control_plane_rate_limit(self) -> None:
        with (
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", 0),
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_BURST", 0),
        ):
            first = runtime_common._control_plane_rate_limit(_request("/turn"))
            second = runtime_common._control_plane_rate_limit(_request("/turn"))

        self.assertIsNone(first)
        self.assertIsNone(second)

    def test_api_turn_is_exempt_from_control_plane_rate_limit(self) -> None:
        with (
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE", 0),
            patch.object(runtime_common, "CONTROL_PLANE_RATE_LIMIT_BURST", 0),
        ):
            first = runtime_common._control_plane_rate_limit(_request("/api/turn"))
            second = runtime_common._control_plane_rate_limit(_request("/api/turn"))

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

    def test_fetch_workflow_snapshot_uses_control_plane_service(self) -> None:
        with patch(
            "server_modules.workflow_service.fetch_workflow_snapshot_sync",
            return_value={"id": "wf-1", "workflowVersionId": "wfver-1", "definition": {"version": "v1"}},
        ) as snapshot_mock:
            payload = runtime_common.fetch_workflow_snapshot(
                "wf-1",
                workflow_version_id="wfver-1",
                workspace_id="workspace-1",
                tenant_id="tenant-1",
            )

        self.assertEqual(payload["workflowVersionId"], "wfver-1")
        snapshot_mock.assert_called_once_with(
            "wf-1",
            workflow_version_id="wfver-1",
            workspace_id="workspace-1",
            tenant_id="tenant-1",
        )


if __name__ == "__main__":
    unittest.main()
