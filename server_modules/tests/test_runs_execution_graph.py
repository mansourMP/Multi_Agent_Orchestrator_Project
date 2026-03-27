import queue
from pathlib import Path
import unittest
from unittest.mock import patch

from server_modules import runs_execution, runs_output


class RunsExecutionGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        runs_execution.runs.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()

    def tearDown(self) -> None:
        runs_execution.runs.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()

    def _register_live_run(self, run_id: str) -> queue.Queue:
        log_queue = queue.Queue()
        runs_execution.runs[run_id] = {
            "status": "running",
            "logs": log_queue,
            "input_queue": queue.Queue(),
            "events": [],
            "_event_seq": 0,
            "node_states": None,
            "context": {"metadata": {}},
            "tool_policy_audit": [],
            "memory_trace": {},
        }
        runs_execution.RUN_QUEUE_INDEX[id(log_queue)] = run_id
        return log_queue

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

    def test_workflow_decision_value_supports_safe_boolean_expressions(self):
        result = runs_execution._workflow_decision_value(
            "hello from workflow",
            {"last_data": {"status": "ok", "count": 2}},
            'result_data["status"] == "ok" and "hello" in context_text and result_data["count"] >= 2',
        )

        self.assertTrue(result)

    def test_workflow_decision_value_rejects_callable_expression_injection(self):
        with self.assertRaises(ValueError):
            runs_execution._workflow_decision_value(
                "hello from workflow",
                {"last_data": {"status": "ok"}},
                '__import__("os").system("whoami")',
            )

    @patch(
        "server_modules.runs_execution.wait_for_human_response",
        return_value={
            "approval_id": "approval-1",
            "correlation_id": "corr-1",
            "decision": "approve",
            "raw_decision": "approve",
            "note": None,
            "approved": True,
            "rejected": False,
            "escalated": False,
        },
    )
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

    @patch(
        "server_modules.runs_execution.wait_for_human_response",
        return_value={
            "approval_id": "approval-1",
            "correlation_id": "corr-1",
            "decision": "please add an escalation branch after review",
            "raw_decision": "Please add an escalation branch after review",
            "note": None,
            "approved": False,
            "rejected": False,
            "escalated": False,
        },
    )
    def test_execute_workflow_graph_captures_review_reply(self, _response_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "review_1",
                    "type": "human",
                    "variant": "review",
                    "config": {
                        "title": "Review workflow",
                        "instructions": "Provide feedback before continuing.",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "review_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-review",
            {"workflow_id": "wf_review", "user_goal": "Review flow", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertEqual(result["result_text"], "Please add an escalation branch after review")
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "review_1")

    @patch("server_modules.runs_execution.wait_for_human_response")
    def test_execute_workflow_graph_records_live_node_states(self, approval_mock):
        def _approve(*_args, **_kwargs):
            node_states = runs_execution.runs["run-node-state"]["node_states"]
            approval_state = node_states["items"]["approval_1"]
            self.assertEqual(approval_state["status"], "waiting_human")
            self.assertTrue(approval_state["waiting_for_approval"])
            return {
                "approval_id": "approval-1",
                "correlation_id": "corr-1",
                "decision": "approve",
                "raw_decision": "approve",
                "note": None,
                "approved": True,
                "rejected": False,
                "escalated": False,
            }

        approval_mock.side_effect = _approve
        log_queue = self._register_live_run("run-node-state")
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "approval_1",
                    "type": "human",
                    "variant": "approval",
                    "config": {"title": "Approve draft", "decision_options": ["approve", "reject"]},
                },
                {"id": "data_1", "type": "data", "variant": "compose", "config": {"template": "Ready to send"}},
            ],
            "edges": [
                {"id": "e1", "source": "trigger_1", "target": "approval_1"},
                {"id": "e2", "source": "approval_1", "target": "data_1"},
            ],
        }

        runs_execution._execute_workflow_graph(
            "run-node-state",
            {"workflow_id": "wf_live", "user_goal": "Review message", "metadata": {}},
            log_queue,
            definition,
        )

        snapshot = runs_output._serialize_run_snapshot("run-node-state", runs_execution.runs["run-node-state"])
        node_states = snapshot["node_states"]
        self.assertEqual(node_states["graph_kind"], "workflow")
        self.assertEqual(node_states["final_node_id"], "data_1")
        self.assertEqual(node_states["counts"]["succeeded"], 3)
        items = {item["node_id"]: item for item in node_states["items"]}
        self.assertEqual(items["trigger_1"]["status"], "succeeded")
        self.assertEqual(items["approval_1"]["status"], "succeeded")
        self.assertEqual(items["data_1"]["status"], "succeeded")
        self.assertIsNone(node_states["active_node_id"])

    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    @patch("server_modules.runs_execution._workflow_execute_connector_action", side_effect=RuntimeError("connector offline"))
    def test_execute_workflow_graph_marks_failed_node_state(self, _connector_action_mock, _approval_mock):
        log_queue = self._register_live_run("run-node-failure")
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {"connector": "telegram_bot", "action_id": "send_message"},
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        with self.assertRaises(RuntimeError):
            runs_execution._execute_workflow_graph(
                "run-node-failure",
                {"workflow_id": "wf_fail", "user_goal": "Send alert", "metadata": {}},
                log_queue,
                definition,
            )

        snapshot = runs_output._serialize_run_snapshot("run-node-failure", runs_execution.runs["run-node-failure"])
        items = {item["node_id"]: item for item in snapshot["node_states"]["items"]}
        self.assertEqual(items["tool_1"]["status"], "failed")
        self.assertIn("connector offline", (items["tool_1"]["error"] or "").lower())

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

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-discord", "discord_bot", {"bot_token": "discord-token", "channel_id": "123456"}),
    )
    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 200, "json": {"id": "msg-1", "content": "hello"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_discord_connector_action(self, _approval_mock, _http_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "discord_bot",
                        "action_id": "send_message",
                        "message": "Ship it",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-discord",
            {"workflow_id": "wf_discord", "user_goal": "Send Discord message", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("discord_bot.send_message", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=(
            "cred-whatsapp",
            "whatsapp_twilio",
            {
                "account_sid": "AC123",
                "auth_token": "token-123",
                "from_number": "whatsapp:+10000000000",
                "to_number": "whatsapp:+19999999999",
            },
        ),
    )
    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 201, "json": {"sid": "SM123"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_whatsapp_connector_action(self, _approval_mock, _http_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "whatsapp_twilio",
                        "action_id": "send_message",
                        "message": "Ping from workflow",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-whatsapp",
            {"workflow_id": "wf_whatsapp", "user_goal": "Send WhatsApp", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("whatsapp_twilio.send_message", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-wechat", "wechat_work", {"webhook_url": "https://example.com/wechat"}),
    )
    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 200, "json": {"errcode": 0, "errmsg": "ok"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_wechat_connector_action(self, _approval_mock, _http_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "wechat_work",
                        "action_id": "send_message",
                        "message": "Post update",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-wechat",
            {"workflow_id": "wf_wechat", "user_goal": "Send WeChat", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("wechat_work.send_message", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-instagram", "instagram_business", {"access_token": "ig-token", "page_id": "998877"}),
    )
    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 200, "json": {"id": "reply-1"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_instagram_publish_reply(self, _approval_mock, _http_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "instagram_business",
                        "action_id": "publish_reply",
                        "comment_id": "112233",
                        "message": "Thanks for the comment.",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-instagram-reply",
            {"workflow_id": "wf_instagram_reply", "user_goal": "Reply to comment", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("instagram_business.publish_reply", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-instagram", "instagram_business", {"access_token": "ig-token", "page_id": "998877"}),
    )
    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 200, "json": {"message_id": "dm-1"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_instagram_send_dm(self, _approval_mock, _http_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "instagram_business",
                        "action_id": "send_dm",
                        "recipient_id": "445566",
                        "message": "Thanks for reaching out.",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-instagram-dm",
            {"workflow_id": "wf_instagram_dm", "user_goal": "Reply in DM", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("instagram_business.send_dm", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution.http_json_request",
        return_value={"status": 200, "json": {"ok": True, "id": "req-1"}, "text": ""},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_custom_api_http_request(self, _approval_mock, _http_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "custom_api",
                        "action_id": "http_request",
                        "method": "POST",
                        "url": "https://example.com/hook",
                        "payload": {"hello": "world"},
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-custom-api",
            {"workflow_id": "wf_custom_api", "user_goal": "Call API", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("custom_api.http_request", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    def test_execute_workflow_graph_blocks_custom_api_private_url(self):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_connector_action(
                {"workspace_id": "default", "metadata": {}},
                {
                    "connector": "custom_api",
                    "action_id": "http_request",
                    "url": "http://127.0.0.1:8080/hook",
                },
                current_text="Call API",
            )

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-m365", "microsoft_365", {"access_token": "token"}),
    )
    @patch(
        "server_modules.runs_execution.microsoft_365_upload_drive_file",
        return_value={"id": "drive-item-1", "name": "report.txt"},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_runs_microsoft_upload_drive_file(self, _approval_mock, _upload_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "microsoft_365",
                        "action_id": "upload_drive_file",
                        "path": "reports/report.txt",
                        "content": "hello onedrive",
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-onedrive-upload",
            {"workflow_id": "wf_onedrive", "user_goal": "Upload file", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("microsoft_365.upload_drive_file", result["result_text"])
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

    def test_execute_workflow_graph_rejects_code_tool_targeting_cloud(self):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "code",
                    "config": {
                        "execution_target": "cloud",
                        "command": "python",
                        "argv": ["-c", "print('hi')"],
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        with self.assertRaises(RuntimeError) as ctx:
            runs_execution._execute_workflow_graph(
                "run-code-cloud",
                {"workflow_id": "wf_code_cloud", "user_goal": "Run code", "metadata": {}},
                queue.Queue(),
                definition,
            )

        self.assertIn("cannot target cloud directly", str(ctx.exception))

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_local_code_tool_requires_reviewed_execution_path(self, create_child_run_mock):
        with self.assertRaises(RuntimeError) as ctx:
            runs_execution._workflow_execute_local_tool(
                "run-code-local",
                {"metadata": {}},
                {
                    "code": "print('ok')",
                    "execution_target": "local_companion",
                    "permissions": {"file_mount_grants": []},
                },
                label="Run code",
                variant="code",
                current_text="",
            )

        self.assertIn("reviewed higher-trust execution path", str(ctx.exception))
        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_local_code_tool_rejects_shell_fields(self, create_child_run_mock):
        with self.assertRaises(RuntimeError) as ctx:
            runs_execution._workflow_execute_local_tool(
                "run-code-shell-fields",
                {"metadata": {}},
                {
                    "command": "python3 -c \"print('ok')\"",
                    "execution_target": "local_companion",
                    "permissions": {"file_mount_grants": []},
                },
                label="Run code",
                variant="code",
                current_text="",
            )

        self.assertIn("cannot use command, argv, or capability", str(ctx.exception))
        create_child_run_mock.assert_not_called()

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-telegram", "telegram_bot", {"chat_id": "12345"}),
    )
    @patch(
        "server_modules.runs_execution.handle_telegram_send_message",
        return_value={"ok": True, "message_id": "tg-1"},
    )
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    @patch(
        "server_modules.runs_execution.generate_with_candidate_failover",
        return_value="Thanks, your request has been triaged and assigned.",
    )
    def test_launch_gate_connector_triage_workflow(self, _generate_mock, _approval_mock, _telegram_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {
                    "id": "trigger_1",
                    "type": "trigger",
                    "variant": "connector_event",
                    "config": {"connector": "telegram_bot", "event": "inbound_message"},
                },
                {
                    "id": "agent_1",
                    "type": "agent",
                    "config": {"identity": {"name": "Triage", "goal": "Classify and respond"}},
                },
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {"connector": "telegram_bot", "action_id": "send_message"},
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger_1", "target": "agent_1"},
                {"id": "e2", "source": "agent_1", "target": "tool_1"},
            ],
        }

        result = runs_execution._execute_workflow_graph(
            "launch-connector-triage",
            {"workflow_id": "wf_launch_message", "user_goal": "Customer asked for help", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("telegram_bot.send_message", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch(
        "server_modules.runs_execution._workflow_tool_connector_secret",
        return_value=("cred-gws", "google_workspace", {"auth_mode": "gws_local"}),
    )
    @patch(
        "server_modules.runs_execution.google_workspace_local_create_draft",
        return_value={"id": "draft-1", "message": {"id": "msg-1"}},
    )
    @patch("server_modules.runs_execution.google_workspace_uses_local_cli", return_value=True)
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    @patch(
        "server_modules.runs_execution.wait_for_human_response",
        return_value={
            "approval_id": "approval-1",
            "correlation_id": "corr-1",
            "decision": "approve",
            "raw_decision": "approve",
            "note": "",
            "approved": True,
            "rejected": False,
            "escalated": False,
        },
    )
    def test_launch_gate_scheduled_approval_workflow(self, _human_mock, _approval_mock, _local_cli_mock, _draft_mock, _secret_mock):
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "schedule", "config": {"cron": "0 9 * * 1-5"}},
                {"id": "data_1", "type": "data", "variant": "compose", "config": {"template": "Daily brief ready"}},
                {
                    "id": "approval_1",
                    "type": "human",
                    "variant": "approval",
                    "config": {"title": "Approve daily brief", "decision_options": ["approve", "reject"]},
                },
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "connector_action",
                    "config": {
                        "connector": "google_workspace",
                        "action_id": "draft_email",
                        "to_email": "ops@example.com",
                        "subject": "Daily brief",
                    },
                },
            ],
            "edges": [
                {"id": "e1", "source": "trigger_1", "target": "data_1"},
                {"id": "e2", "source": "data_1", "target": "approval_1"},
                {"id": "e3", "source": "approval_1", "target": "tool_1"},
            ],
        }

        result = runs_execution._execute_workflow_graph(
            "launch-scheduled-approval",
            {"workflow_id": "wf_launch_schedule", "user_goal": "Send daily brief", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertIn("google_workspace.draft_email", result["result_text"])
        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "tool_1")

    @patch("server_modules.runs_execution.wait_for_human_response")
    @patch("server_modules.runs_execution._workflow_wait_for_child_run")
    @patch("server_modules.runs_delegation._create_run_from_request")
    def test_launch_gate_subflow_review_workflow(self, create_child_mock, wait_child_mock, human_mock):
        create_child_mock.return_value = {"run_id": "child-1", "route": {"selected": "cloud"}}
        wait_child_mock.return_value = {
            "status": "completed",
            "result": "Subflow prepared a draft response.",
            "result_data": {"summary": "child complete"},
        }
        human_mock.return_value = {
            "approval_id": "approval-review",
            "correlation_id": "corr-review",
            "decision": "Please publish after legal review",
            "raw_decision": "Please publish after legal review",
            "note": "",
            "approved": False,
            "rejected": False,
            "escalated": False,
        }

        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "workflow", "config": {"workflow_id": "parent"}},
                {"id": "subflow_1", "type": "subflow", "variant": "call_workflow", "config": {"workflow_id": "child_wf"}},
                {
                    "id": "review_1",
                    "type": "human",
                    "variant": "review",
                    "config": {"title": "Review child result", "instructions": "Share final note"},
                },
                {"id": "data_1", "type": "data", "variant": "compose", "config": {"template": "Final handoff"}},
            ],
            "edges": [
                {"id": "e1", "source": "trigger_1", "target": "subflow_1"},
                {"id": "e2", "source": "subflow_1", "target": "review_1"},
                {"id": "e3", "source": "review_1", "target": "data_1"},
            ],
        }

        result = runs_execution._execute_workflow_graph(
            "launch-subflow-review",
            {"workflow_id": "wf_launch_subflow", "user_goal": "Run child workflow then review", "metadata": {}},
            queue.Queue(),
            definition,
        )

        self.assertEqual(result["result_data"]["workflow_execution"]["final_node_id"], "data_1")
        self.assertIn("Final handoff", result["result_text"])
        self.assertIn("Please publish after legal review", result["result_text"])

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

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_local_file_tool_blocks_local_root_without_grant(self, create_child_run_mock):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_local_tool(
                "run-local-blocked",
                {"metadata": {}},
                {
                    "path": str(Path.cwd() / "README.md"),
                    "mode": "read",
                    "execution_target": "local_companion",
                    "permissions": {"file_mount_grants": []},
                },
                label="Read host file",
                variant="file",
                current_text="",
            )

        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_local_shell_tool_blocks_absolute_cwd_without_local_root_grant(self, create_child_run_mock):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_local_tool(
                "run-shell-blocked",
                {"metadata": {}},
                {
                    "command": "pwd",
                    "cwd": str(Path.cwd()),
                    "execution_target": "local_companion",
                    "permissions": {"file_mount_grants": []},
                },
                label="Run shell",
                variant="shell",
                current_text="",
            )

        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_local_shell_tool_rejects_mixed_capability_and_command(self, create_child_run_mock):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_local_tool(
                "run-shell-mixed",
                {"metadata": {}},
                {
                    "capability": "stack.status",
                    "command": "pwd",
                    "execution_target": "local_companion",
                    "permissions": {"file_mount_grants": []},
                },
                label="Run shell",
                variant="shell",
                current_text="",
            )

        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_browser_tool_requires_explicit_browser_permission_for_session_profile(self, create_child_run_mock):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_local_tool(
                "run-browser-auth",
                {"metadata": {}},
                {
                    "url": "https://example.com",
                    "mode": "capture_page",
                    "session_profile": "default",
                    "execution_target": "local_companion",
                    "permissions": {
                        "file_mount_grants": [],
                        "browser_permissions": {"allow": False},
                    },
                },
                label="Capture page",
                variant="browser",
                current_text="",
            )

        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_tool_create_child_local_run")
    def test_browser_tool_rejects_session_backed_interactive_actions(self, create_child_run_mock):
        with self.assertRaises(RuntimeError):
            runs_execution._workflow_execute_local_tool(
                "run-browser-interactive",
                {"metadata": {}},
                {
                    "url": "https://example.com",
                    "mode": "capture_page",
                    "session_profile": "default",
                    "browser_actions": [{"action": "click", "selector": "#login"}],
                    "execution_target": "local_companion",
                    "permissions": {
                        "file_mount_grants": [],
                        "browser_permissions": {"allow": True},
                    },
                },
                label="Capture page",
                variant="browser",
                current_text="",
            )

        create_child_run_mock.assert_not_called()

    @patch("server_modules.runs_execution._workflow_execute_local_tool")
    @patch("server_modules.runs_execution.wait_for_human_decision", return_value=True)
    def test_execute_workflow_graph_requires_approval_for_session_backed_browser_tool(self, approval_mock, local_tool_mock):
        local_tool_mock.return_value = {
            "summary": "Browser automation completed.",
            "result_data": {"browser": {"url": "https://example.com"}},
        }
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "tool_1",
                    "type": "tool",
                    "variant": "browser",
                    "config": {
                        "url": "https://example.com/private",
                        "mode": "extract_text",
                        "session_profile": "default",
                        "execution_target": "local_companion",
                        "permissions": {
                            "action_policy": "guarded",
                            "file_mount_grants": [],
                            "browser_permissions": {"allow": True},
                        },
                    },
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "tool_1"}],
        }

        result = runs_execution._execute_workflow_graph(
            "run-browser-approval",
            {"workflow_id": "wf_browser_guarded", "user_goal": "Read a private page", "metadata": {}},
            queue.Queue(),
            definition,
        )

        approval_mock.assert_called_once()
        self.assertIn("Browser automation completed", result["result_text"])

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

    @patch("server_modules.runs_delegation._create_run_from_request")
    @patch("server_modules.runs_execution.time.sleep")
    def test_execute_workflow_graph_waits_for_subflow_human_input_and_resumes(self, sleep_mock, create_child_run_mock):
        create_child_run_mock.return_value = {
            "run_id": "child-run-wait",
            "route": {"selected": "cloud"},
        }
        runs_execution.runs["child-run-wait"] = {
            "status": "waiting_for_input",
            "pending_approval": {"approval_id": "approval-child-1"},
            "result": None,
            "result_data": {},
        }

        def _sleep(_seconds):
            runs_execution.runs["child-run-wait"]["status"] = "completed"
            runs_execution.runs["child-run-wait"]["result"] = "Child workflow finished after approval."
            runs_execution.runs["child-run-wait"]["result_data"] = {"summary": "Child workflow finished after approval."}

        sleep_mock.side_effect = _sleep
        log_queue = self._register_live_run("run-parent-wait")
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
            "run-parent-wait",
            {
                "engine": "orion",
                "workflow_id": "wf_parent",
                "workspace_id": "default",
                "user_goal": "Run child workflow",
                "metadata": {},
            },
            log_queue,
            definition,
        )

        self.assertEqual(result["result_text"], "Child workflow finished after approval.")
        snapshot = runs_output._serialize_run_snapshot("run-parent-wait", runs_execution.runs["run-parent-wait"])
        items = {item["node_id"]: item for item in snapshot["node_states"]["items"]}
        self.assertEqual(items["subflow_1"]["status"], "succeeded")
        self.assertFalse(items["subflow_1"]["waiting_for_approval"])
        self.assertEqual(items["subflow_1"]["child_run_id"], "child-run-wait")


if __name__ == "__main__":
    unittest.main()
