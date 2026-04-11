import asyncio
import unittest
from unittest.mock import patch

from server_modules.agent_manifest import AgentManifest, AgentManifestIdentity
from server_modules import execution_sandbox_service


def _manifest() -> AgentManifest:
    return AgentManifest(
        manifest_id="manifest-parts-pro",
        identity=AgentManifestIdentity(
            name="Parts Pro",
            role="Inventory Specialist",
            archetype="support_specialist",
            summary="Help customers find parts.",
        ),
    )


class ExecutionSandboxServiceTests(unittest.TestCase):
    def test_runtime_scope_for_hosted_secure_has_ephemeral_isolation_defaults(self):
        scope = execution_sandbox_service.runtime_scope(
            runtime_mode="hosted_secure",
            runtime_profile={
                "id": "profile-cloud",
                "runtime_class": "cloud_worker",
            },
        )

        self.assertEqual(scope["mode"], "hosted_secure")
        self.assertEqual(scope["workspace_kind"], "ephemeral")
        self.assertTrue(scope["read_only_base_image"])
        self.assertFalse(scope["host_mounts_allowed"])
        self.assertFalse(scope["docker_socket_exposed"])
        self.assertTrue(scope["network_policy"]["hooks_ready"])
        self.assertEqual(scope["state_layer_policy"]["local_private_memory_access"], "cloud_safe_summaries_only")
        self.assertFalse(scope["state_layer_policy"]["cross_install_private_memory_allowed"])
        self.assertFalse(scope["state_layer_policy"]["specialist_to_captain_private_access"])
        self.assertEqual(scope["state_layer_policy"]["artifacts_history"]["cross_install_exchange_mode"], "artifacts_only")

    def test_runtime_scope_for_local_secure_uses_approved_folders_and_apps(self):
        scope = execution_sandbox_service.runtime_scope(
            runtime_mode="local_secure",
            runtime_profile={
                "id": "profile-local",
                "runtime_class": "desktop_companion",
                "root_folder_uri": "/Users/mansur/Documents/Empyralis",
                "metadata": {
                    "allowed_folders": ["/Users/mansur/Desktop"],
                    "allowed_applications": ["Mail", "Safari"],
                },
            },
            install={"root_folder_uri": "/Users/mansur/Documents/Empyralis"},
        )

        self.assertEqual(scope["mode"], "local_secure")
        self.assertTrue(scope["host_mounts_allowed"])
        self.assertEqual(
            scope["approved_folders"],
            ["/Users/mansur/Documents/Empyralis", "/Users/mansur/Desktop"],
        )
        self.assertEqual(scope["approved_applications"], ["Mail", "Safari"])
        self.assertEqual(scope["state_layer_policy"]["local_private_memory_access"], "allowed_locally")
        self.assertFalse(scope["state_layer_policy"]["specialist_private_memory"]["cross_install_allowed"])

    def test_execute_hosted_customer_turn_routes_through_worker_and_attaches_sandbox_metadata(self):
        async def _run() -> dict:
            with patch(
                "server_modules.execution_sandbox_service._run_hosted_worker",
                return_value={"status": "ok", "reply": "Sandboxed reply"},
            ) as worker_mock:
                result = await execution_sandbox_service.execute_hosted_customer_turn(
                    manifest=_manifest(),
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    goal="Hello",
                )
            self.assertEqual(result["status"], "ok")
            worker_mock.assert_called_once()
            return result

        result = asyncio.run(_run())
        self.assertEqual(result["reply"], "Sandboxed reply")


if __name__ == "__main__":
    unittest.main()
