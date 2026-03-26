import queue
import unittest
from unittest.mock import patch

from server_modules import runs_execution


class RunsExecutionGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        runs_execution.runs.clear()

    def tearDown(self) -> None:
        runs_execution.runs.clear()

    def test_predict_tool_ids_from_workflow_definition_uses_agent_and_tool_nodes(self):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {
                    "id": "agent_1",
                    "type": "agent",
                    "config": {
                        "tools": {
                            "dynamic_allowed": ["draft_email"],
                            "explicit_required": ["send_message"],
                        }
                    },
                },
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "shell",
                    "config": {},
                },
            ],
            "edges": [],
        }
        context = {"workflow_definition": definition, "metadata": {}}

        predicted = runs_execution._predict_tool_ids_for_context(context)

        self.assertEqual(predicted, ["draft_email", "send_message", "execute_shell_command"])

    def test_compile_orion_dag_prefers_workflow_definition(self):
        dag = runs_execution._compile_orion_dag(
            {
                "workflow_id": "wf_123",
                "workflow_definition": {
                    "version": "empyralist.workflow.v2",
                    "nodes": [{"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}}],
                    "edges": [],
                },
                "metadata": {},
            }
        )

        self.assertEqual(dag["type"], "workflow_graph")
        self.assertEqual(dag["nodes"][0]["kind"], "workflow_graph_execute")

    def test_tool_policy_tool_id_maps_connector_and_document_variants(self):
        self.assertEqual(
            runs_execution._workflow_tool_policy_tool_id(
                "connector_action",
                {"action_id": "create_doc"},
            ),
            "document_create",
        )
        self.assertEqual(
            runs_execution._workflow_tool_policy_tool_id(
                "spreadsheet",
                {"operation": "append"},
            ),
            "spreadsheet_append",
        )
        self.assertEqual(
            runs_execution._workflow_tool_policy_tool_id(
                "document",
                {"operation": "update", "file_path": "deck.pptx"},
            ),
            "presentation_update",
        )

    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_explicit_approval(self, _approval_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "approval_1",
                    "type": "human",
                    "variant": "approval",
                    "config": {
                        "title": "Approve draft",
                        "instructions": "Confirm before continuing.",
                        "decision_options": ["approve", "reject"],
                    },
                },
                {
                    "id": "data_1",
                    "type": "data",
                    "variant": "compose",
                    "config": {"template": "Approved and ready"},
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger_1", "target": "approval_1"},
                {"id": "e2", "source": "approval_1", "target": "data_1"},
            ],
        }

        result = runs_execution._execute_workflow_graph(
            "run-1",
            {"workflow_id": "wf_approval", "user_goal": "Review this", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("Approved and ready", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "data_1")

    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    @patch("server_modules.runs_execution._workflow_execute_connector_action")
    def test_execute_workflow_graph_runs_connector_action_tool(self, connector_action_mock, _approval_mock):
        connector_action_mock.return_value = {
            "summary": "Connector action completed: google_workspace.draft_email.",
            "result_data": {
                "connector_action": {
                    "connector": "google_workspace",
                    "action_id": "draft_email",
                }
            },
        }
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "google_workspace",
                        "action_id": "draft_email",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-connector",
            {"workflow_id": "wf_connector", "user_goal": "Draft email", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("Connector action completed", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    @patch("server_modules.runs_execution.execute_outcome_pack")
    def test_execute_workflow_graph_runs_document_tool(self, execute_outcome_pack_mock, _approval_mock):
        execute_outcome_pack_mock.return_value = {
            "pack_id": "document-studio-v1",
            "summary": "Document Studio completed: created Word document.",
            "outputs": {
                "actions": [{"action": "document_create", "file_path": "notes.docx"}],
                "items_written": 1,
                "outbound_actions": 1,
                "urgent_count": 0,
            },
            "next_steps": ["Review the generated document."],
        }
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "document",
                    "config": {
                        "operation": "create",
                        "file_path": "notes.docx",
                        "title": "Notes",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-document",
            {"workflow_id": "wf_document", "user_goal": "Create doc", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("Document Studio completed", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch("server_modules.runs_execution._workflow_execute_local_tool")
    def test_execute_workflow_graph_runs_local_tool_variant(self, local_tool_mock):
        local_tool_mock.return_value = {
            "summary": "Local tool node completed: Write file.",
            "result_data": {"local_child_run_id": "child-local-1"},
        }
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "file",
                    "config": {
                        "path": "README.md",
                        "mode": "write",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-local",
            {"workflow_id": "wf_local", "user_goal": "Write file", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("Local tool node completed", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch("server_modules.runs_delegation._create_run_from_request")
    def test_execute_workflow_graph_waits_for_subflow_completion(self, create_child_run_mock):
        create_child_run_mock.return_value = {
            "run_id": "child-run-1",
            "route": {"selected": "cloud"},
        }
        runs_execution.runs["child-run-1"] = {
            "status": "completed",
            "result": "Child workflow finished.",
            "result_data": {"summary": "Child workflow finished."},
        }
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "subflow_1",
                    "type": "subflow",
                    "variant": "call_workflow",
                    "config": {"workflow_id": "wf_child", "mode": "sync"},
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "subflow_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-parent",
            {
                "engine": "orion",
                "workflow_id": "wf_parent",
                "workspace_id": "default",
                "user_goal": "Run child workflow",
                "metadata": {},
            },
            queue.Queue(),
            definition,
        )

        self.assertEqual(result["result_text"], "Child workflow finished.")
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "subflow_1")


if __name__ == "__main__":
    unittest.main()
