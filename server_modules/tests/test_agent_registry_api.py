import asyncio
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import agent_registry_api


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def patch(self, path, **kwargs):
        return self._register("PATCH", path, **kwargs)


class AgentRegistryApiRouteTests(unittest.TestCase):
    def test_register_agent_registry_routes_adds_install_run_endpoint(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            agent_registry_api.register_agent_registry_routes(app)
            self.assertIn(("GET", "/agent-registry/definitions"), app.routes)
            self.assertIn(("GET", "/agent-registry/definitions/{definition_id}"), app.routes)
            self.assertIn(("GET", "/agent-registry/runtime-profiles"), app.routes)
            self.assertIn(("GET", "/agent-registry/chat-context"), app.routes)
            self.assertIn(("GET", "/agent-registry/installs"), app.routes)
            self.assertIn(("POST", "/agent-registry/installs"), app.routes)
            self.assertIn(("GET", "/agent-registry/installs/{install_id}"), app.routes)
            self.assertIn(("PATCH", "/agent-registry/installs/{install_id}"), app.routes)
            self.assertIn(("POST", "/agents/{install_id}/run"), app.routes)
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def test_run_installed_agent_builds_canonical_turn_request(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            agent_registry_api.register_agent_registry_routes(app)
            route = app.routes[("POST", "/agents/{install_id}/run")]
            compiled = {
                "install": {
                    "id": "install-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "workspace-1",
                    "agent_definition_id": "agent-1",
                    "agent_definition_version_id": "agentver-1",
                    "runtime_profile_id": "profile-1",
                    "thread_id": "thread-1",
                    "runtime_profile": {
                        "id": "profile-1",
                        "label": "My Mac",
                        "machine_id": "machine-1",
                        "runtime_id": "runtime-1",
                    },
                    "agent_definition": {"name": "Desktop Operator", "slug": "desktop-operator"},
                },
                "workflow_id": "wf-compiled",
                "workflow_version_id": "wfver-compiled",
                "workflow_snapshot": {
                    "id": "wf-compiled",
                    "workflowVersionId": "wfver-compiled",
                    "definition": {"version": "empyralist.workflow.v2", "nodes": [], "edges": []},
                },
                "run_metadata": {
                    "execution_target": "local_companion",
                    "execution_target_selected": "local_companion",
                },
            }

            with (
                patch("server_modules.agent_registry_api.template_compiler_service.ensure_install_compiled_artifact", new=AsyncMock(return_value=compiled)),
                patch("server_modules.agent_registry_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.agent_registry_api._run_execution_services", return_value={"run": "services"}),
                patch("server_modules.agent_registry_api.execute_canonical_agent_turn", new=AsyncMock(return_value={
                    "status": "accepted",
                    "reply": "",
                    "run_id": "run-1",
                    "metadata": {"created_run": {"run_id": "run-1", "status": "queued"}},
                })) as turn_mock,
            ):
                result = asyncio.run(
                    route(
                        "install-1",
                        agent_registry_api.AgentInstallRunRequest(message="Open Calculator"),
                        current_user={"user_id": "user-1", "email": "user@example.com", "role": "owner", "is_admin": True},
                    )
                )

            self.assertEqual(result.status, "accepted")
            turn_request = turn_mock.await_args.kwargs["turn_request"]
            self.assertEqual(turn_request.context_hints["workflow_id"], "wf-compiled")
            self.assertEqual(turn_request.context_hints["workflow_version_id"], "wfver-compiled")
            self.assertEqual(turn_request.machine_target, "machine-1")
            metadata = turn_request.context_hints["metadata"]
            self.assertEqual(metadata["runtime_profile_id"], "profile-1")
            self.assertEqual(metadata["workflow_definition"]["version"], "empyralist.workflow.v2")
            self.assertEqual(turn_request.thread_id, "thread-1")
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def test_create_install_compiles_before_return(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            agent_registry_api.register_agent_registry_routes(app)
            route = app.routes[("POST", "/agent-registry/installs")]
            install_record = {
                "id": "install-1",
                "tenant_id": "tenant-1",
                "workspace_id": "workspace-1",
                "label": "Executive Assistant",
            }
            with (
                patch("server_modules.agent_registry_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.agent_registry_api.agent_registry_repository.create_workspace_agent_install", new=AsyncMock(return_value=install_record)) as create_mock,
                patch("server_modules.agent_registry_api.template_compiler_service.ensure_install_compiled_artifact", new=AsyncMock(return_value={"install": install_record})) as compile_mock,
            ):
                result = asyncio.run(
                    route(
                        agent_registry_api.AgentInstallUpsertRequest(
                            workspace_id="workspace-1",
                            agent_definition_id="agentdef-1",
                            label="Executive Assistant",
                        ),
                        current_user={"user_id": "user-1", "tenant_id": "tenant-1", "role": "owner", "is_admin": True},
                    )
                )
            self.assertEqual(result["id"], "install-1")
            create_mock.assert_awaited_once()
            compile_mock.assert_awaited_once()
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def test_master_chat_context_returns_sage_and_specialists(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            agent_registry_api.register_agent_registry_routes(app)
            route = app.routes[("GET", "/agent-registry/chat-context")]
            master_install = {
                "id": "install-sage",
                "label": "Sage",
                "workspace_id": "workspace-1",
                "tenant_id": "tenant-1",
            }
            specialists = [
                {"id": "install-research", "label": "Web Researcher", "enabled": True, "status": "active"},
                {"id": "install-desktop", "label": "Desktop Operator", "enabled": False, "status": "active"},
            ]
            thread_record = {"id": "thread-sage", "title": "Sage", "turns": []}
            with (
                patch("server_modules.agent_registry_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.agent_registry_api.agent_registry_repository.get_workspace_master_agent_install", new=AsyncMock(return_value=master_install)),
                patch("server_modules.agent_registry_api.agent_registry_repository.list_workspace_agent_installs", new=AsyncMock(return_value=specialists)),
                patch("server_modules.agent_registry_api.agent_registry_repository.build_master_thread_id", return_value="thread-sage"),
                patch("server_modules.agent_registry_api.thread_service.ensure_master_thread", new=AsyncMock(return_value=thread_record)),
                patch("server_modules.agent_registry_api.thread_service.get_thread", new=AsyncMock(return_value=thread_record)),
            ):
                result = asyncio.run(
                    route(
                        workspace_id="workspace-1",
                        current_user={"user_id": "user-1", "tenant_id": "tenant-1", "role": "owner", "is_admin": True},
                    )
                )
            self.assertEqual(result["thread_id"], "thread-sage")
            self.assertEqual(result["master_install"]["id"], "install-sage")
            self.assertEqual(len(result["specialist_installs"]), 1)
            self.assertEqual(result["specialist_installs"][0]["id"], "install-research")
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server


if __name__ == "__main__":
    unittest.main()
