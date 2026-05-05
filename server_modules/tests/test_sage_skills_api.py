import asyncio
import sys
import types
import unittest
from unittest.mock import patch

from server_modules import sage_skills_api


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)


class SageSkillsApiTests(unittest.TestCase):
    def test_get_route_normalizes_curated_skill_states_and_reasons(self) -> None:
        fake_server = types.ModuleType("server")
        fake_server.Depends = lambda dependency: dependency
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            sage_skills_api.register_sage_skills_routes(app)
            route = app.routes[("GET", "/api/sage-skills")]
            with (
                patch("server_modules.sage_skills_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.sage_skills_api.workspace_tenant_id", return_value="tenant-1"),
                patch("server_modules.sage_skills_api.current_device_os_label", return_value="macOS"),
                patch(
                    "server_modules.sage_skills_api.list_installed_skills",
                    return_value=[
                        {
                            "id": "1password",
                            "name": "1Password",
                            "enabled": True,
                            "available": True,
                            "description": "Use vault items.",
                            "tools": ["vault.search"],
                            "runtime_metadata": {"action_class": "read", "requires_approval": False},
                        },
                        {
                            "id": "tmux",
                            "name": "tmux",
                            "enabled": True,
                            "available": False,
                            "missing_bins": ["tmux"],
                            "missing_env_vars": ["TMUX_SOCKET"],
                            "supported_os": ["macos"],
                            "availability_reasons": [
                                "Missing runtime dependencies: tmux",
                                "Missing environment variables: TMUX_SOCKET",
                            ],
                            "runtime_metadata": {"action_class": "local_write", "requires_approval": True},
                        },
                        {
                            "id": "custom-helper",
                            "name": "Custom Helper",
                            "enabled": False,
                            "available": True,
                            "runtime_metadata": {"action_class": "read", "requires_approval": False},
                        },
                    ],
                ),
            ):
                payload = asyncio.run(route(workspace_id="workspace-1", current_user={"user_id": "user-1"}))
            self.assertEqual(payload["summary"]["ready_count"], 1)
            self.assertEqual(payload["summary"]["needs_setup_count"], 3)
            self.assertEqual(payload["summary"]["unsupported_count"], 0)
            self.assertEqual(payload["summary"]["disabled_count"], 1)
            self.assertEqual(payload["curated_pack"][0]["name"], "1Password")
            self.assertEqual(payload["curated_pack"][1]["name"], "Apple Notes")
            self.assertEqual(payload["curated_pack"][2]["name"], "Apple Reminders")
            self.assertEqual(payload["curated_pack"][3]["name"], "tmux")
            self.assertEqual(payload["curated_pack"][0]["status"], "ready")
            self.assertTrue(payload["curated_pack"][0]["active_now"])
            self.assertEqual(payload["curated_pack"][1]["status"], "needs_setup")
            self.assertEqual(payload["curated_pack"][3]["status"], "needs_setup")
            self.assertEqual(
                payload["curated_pack"][3]["reason"],
                "Missing runtime dependencies: tmux; Missing environment variables: TMUX_SOCKET",
            )
            self.assertEqual(payload["curated_pack"][3]["supported_os"], ["macos"])
            self.assertIn("Install: tmux.", payload["curated_pack"][3]["setup_requirement"])
            self.assertEqual(payload["items"][-1]["status"], "disabled_policy")
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server


if __name__ == "__main__":
    unittest.main()
