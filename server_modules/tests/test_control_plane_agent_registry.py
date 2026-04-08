import unittest
from unittest.mock import AsyncMock, patch

from server_modules import control_plane_repository, thread_service
from server_modules.agent_registry_models import (
    AgentDefinitionModel,
    AgentDefinitionVersionModel,
    RuntimeProfileModel,
    WorkspaceAgentInstallModel,
)


class ControlPlaneAgentRegistrySchemaTests(unittest.TestCase):
    def test_schema_sql_includes_agent_registry_tables_and_relationship_columns(self):
        schema = control_plane_repository.CONTROL_PLANE_SCHEMA_SQL

        for fragment in (
            "CREATE TABLE IF NOT EXISTS runtime_profiles",
            "CREATE TABLE IF NOT EXISTS agent_definitions",
            "CREATE TABLE IF NOT EXISTS agent_definition_versions",
            "CREATE TABLE IF NOT EXISTS workspace_agent_installs",
            "compiled_workflow_version_id TEXT NULL REFERENCES workflow_versions(id) ON DELETE SET NULL",
            "ALTER TABLE workspace_agent_installs\n    ADD COLUMN IF NOT EXISTS compiled_workflow_version_id TEXT NULL;",
            "ALTER TABLE agent_threads\n    ADD COLUMN IF NOT EXISTS master_agent_install_id TEXT NULL;",
            "ALTER TABLE agent_sessions\n    ADD COLUMN IF NOT EXISTS master_agent_install_id TEXT NULL,",
            "ALTER TABLE agent_turns\n    ADD COLUMN IF NOT EXISTS active_agent_install_id TEXT NULL,",
            "fk_agent_threads_master_agent_install",
            "fk_agent_sessions_runtime_profile",
            "fk_agent_turns_active_agent_install",
            "fk_workspace_agent_installs_compiled_workflow_version",
        ):
            self.assertIn(fragment, schema)

    def test_sqlalchemy_models_include_isolation_columns_and_foreign_keys(self):
        for model in (
            RuntimeProfileModel,
            AgentDefinitionModel,
            AgentDefinitionVersionModel,
            WorkspaceAgentInstallModel,
        ):
            table = model.__table__
            self.assertIn("tenant_id", table.c)
            self.assertIn("workspace_id", table.c)

        version_fk_targets = {
            foreign_key.target_fullname
            for foreign_key in AgentDefinitionVersionModel.__table__.c["compiled_workflow_version_id"].foreign_keys
        }
        self.assertIn("workflow_versions.id", version_fk_targets)

        install_fk_targets = {
            foreign_key.target_fullname
            for foreign_key in WorkspaceAgentInstallModel.__table__.c["runtime_profile_id"].foreign_keys
        }
        self.assertIn("runtime_profiles.id", install_fk_targets)
        compiled_fk_targets = {
            foreign_key.target_fullname
            for foreign_key in WorkspaceAgentInstallModel.__table__.c["compiled_workflow_version_id"].foreign_keys
        }
        self.assertIn("workflow_versions.id", compiled_fk_targets)


class ThreadServiceAgentBindingTests(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_master_thread_passes_master_agent_install_id(self):
        ensure_mock = AsyncMock(return_value={"id": "thread-1"})
        with patch("server_modules.thread_service.control_plane_repository.ensure_agent_thread", new=ensure_mock):
            await thread_service.ensure_master_thread(
                thread_id="thread-1",
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                owner_user_id="user-1",
                master_agent_install_id="install-master",
                channel="web",
            )

        self.assertEqual(ensure_mock.await_args.kwargs["master_agent_install_id"], "install-master")

    async def test_record_assistant_turn_passes_install_and_runtime_profile(self):
        upsert_mock = AsyncMock(return_value={"id": "turn-1"})
        with patch("server_modules.thread_service.control_plane_repository.upsert_agent_turn", new=upsert_mock):
            await thread_service.record_assistant_turn(
                thread_id="thread-1",
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                session_id="session-1",
                actor={"type": "assistant", "id": "sage"},
                reply="done",
                status="completed",
                run_id="run-1",
                active_agent_install_id="install-specialist",
                runtime_profile_id="runtime-local",
                metadata={"request_id": "req-1"},
            )

        self.assertEqual(upsert_mock.await_args.kwargs["active_agent_install_id"], "install-specialist")
        self.assertEqual(upsert_mock.await_args.kwargs["runtime_profile_id"], "runtime-local")


if __name__ == "__main__":
    unittest.main()
