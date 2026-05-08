import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from server_modules import direct_tool_execution_service as service
from server_modules import tool_broker_guard_service


def _callbacks() -> service.DirectToolExecutionCallbacks:
    return service.DirectToolExecutionCallbacks(
        compact_step_detail=lambda value: " ".join(str(value or "").split()).strip() or None,
        titleize_direct_step_token=lambda value: " ".join(word.capitalize() for word in str(value or "").split("_")),
        run_async_tool_call=lambda awaitable: awaitable,
        parse_tool_name=lambda name: (
            tuple(str(name or "").split("__", 1)) if "__" in str(name or "") else tuple(str(name or "").split("_", 1))
        ),
        tool_arguments_payload=lambda payload: payload if isinstance(payload, dict) else {},
        parse_json_object_loose=lambda value: {},
        safe_positive_int=lambda value, default=0: int(value) if str(value or "").strip().isdigit() else default,
        normalize_reasoning_effort=lambda value: str(value or "").strip().lower() or None,
        build_direct_local_tool_config=lambda connector_id, action_id, arguments: ("read", {"connector": connector_id, "action": action_id}),
        format_direct_local_tool_result=lambda result: json.dumps(result, ensure_ascii=False),
        build_direct_tool_config=lambda connector_id, action_id, tool_input: {
            "connector": connector_id,
            "action": action_id,
            "input": tool_input,
        },
        format_direct_tool_result=lambda result: json.dumps(result, ensure_ascii=False),
        llm_task=lambda *args, **kwargs: {"ok": True},
        web_search=lambda query: [],
        web_fetch=lambda url: f"Fetched {url}",
        search_memory_notebook=lambda workspace_id, query, max_results=5: [{"path": "MEMORY.md", "query": query, "max_results": max_results}],
        get_memory_notebook_excerpt=lambda workspace_id, rel_path, from_line=None, line_count=None: {
            "path": rel_path,
            "from_line": from_line,
            "line_count": line_count,
        },
    )


class DirectToolExecutionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        tool_broker_guard_service.reset_state_for_tests()

    def test_direct_tool_step_payload_formats_computer_click(self) -> None:
        payload = service.direct_tool_step_payload(
            "computer",
            "click",
            {"text": "Submit button"},
            step_id="step-1",
            status="running",
            callbacks=_callbacks(),
        )

        self.assertEqual(payload["kind"], "computer")
        self.assertEqual(payload["label"], "Clicking screen")
        self.assertEqual(payload["detail"], "Submit button")

    def test_extract_first_url_and_path_reference_handle_common_inputs(self) -> None:
        self.assertEqual(service.extract_first_url("Check example.com/docs please"), "https://example.com/docs")
        self.assertEqual(service.extract_first_path_reference("Open ./docs/README.md now"), "./docs/README.md")

    def test_execute_single_direct_tool_call_handles_memory_tools(self) -> None:
        callbacks = _callbacks()

        search_raw = service.execute_single_direct_tool_call(
            tool_call={"name": "memory_search", "arguments": {"query": "timezone", "max_results": 3}},
            workspace_id="default",
            thread_id="thread-1",
            callbacks=callbacks,
        )
        get_raw = service.execute_single_direct_tool_call(
            tool_call={"name": "memory_get", "arguments": {"path": "MEMORY.md", "from": 2, "lines": 4}},
            workspace_id="default",
            thread_id="thread-1",
            callbacks=callbacks,
        )

        self.assertEqual(json.loads(search_raw)["results"][0]["query"], "timezone")
        self.assertEqual(json.loads(search_raw)["results"][0]["max_results"], 3)
        self.assertEqual(json.loads(get_raw)["path"], "MEMORY.md")
        self.assertEqual(json.loads(get_raw)["from_line"], 2)

    def test_execute_single_direct_tool_call_emits_audit_events(self) -> None:
        callbacks = _callbacks()

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit:
            raw = service.execute_single_direct_tool_call(
                tool_call={"name": "memory_search", "arguments": {"query": "timezone", "max_results": 3}},
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
                session_ctx={"tenant_id": "tenant-1", "request_id": "req-1"},
                provider="deepseek",
                model="deepseek-chat",
            )

        self.assertEqual(json.loads(raw)["results"][0]["query"], "timezone")
        self.assertEqual([call.kwargs["action"] for call in emit_audit.call_args_list], [
            "direct_tool.started",
            "direct_tool.completed",
        ])
        started = emit_audit.call_args_list[0].kwargs
        self.assertEqual(started["tenant_id"], "tenant-1")
        self.assertEqual(started["workspace_id"], "workspace-1")
        self.assertEqual(started["run_id"], "req-1")
        self.assertEqual(started["metadata"]["connector_id"], "memory")
        self.assertEqual(started["metadata"]["action_id"], "search")
        self.assertEqual(started["metadata"]["provider"], "deepseek")

    def test_execute_single_direct_tool_call_redacts_audit_argument_summary(self) -> None:
        callbacks = _callbacks()
        callbacks = service.DirectToolExecutionCallbacks(
            **{
                **vars(callbacks),
                "build_direct_local_tool_config": lambda connector_id, action_id, arguments: (
                    "read",
                    {"connector": connector_id, "action": action_id},
                ),
            }
        )

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit, patch(
            "server_modules.skills_service._execute_safe_direct_local_tool_call",
            return_value="ok",
        ):
            service.execute_single_direct_tool_call(
                tool_call={
                    "name": "shell_exec",
                    "arguments": {"command": "curl -H 'Authorization: Bearer sk-secret123456' https://example.com"},
                },
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
            )

        summary = emit_audit.call_args_list[0].kwargs["metadata"]["argument_summary"]
        self.assertIn("[redacted-secret]", summary)
        self.assertNotIn("sk-secret123456", summary)

    def test_execute_single_direct_tool_call_redacts_audit_result_summary(self) -> None:
        callbacks = _callbacks()
        callbacks = service.DirectToolExecutionCallbacks(
            **{
                **vars(callbacks),
                "build_direct_local_tool_config": lambda connector_id, action_id, arguments: (
                    "read",
                    {"connector": connector_id, "action": action_id},
                ),
            }
        )

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit, patch(
            "server_modules.skills_service._execute_safe_direct_local_tool_call",
            return_value="token=sk-secret123456",
        ):
            service.execute_single_direct_tool_call(
                tool_call={
                    "name": "shell_exec",
                    "arguments": {"command": "echo ok"},
                },
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
            )

        completed = emit_audit.call_args_list[1].kwargs["metadata"]["result_summary"]
        self.assertIn("[redacted-secret]", completed)
        self.assertNotIn("sk-secret123456", completed)

    def test_execute_single_direct_tool_call_emits_governance_metadata_for_shell(self) -> None:
        callbacks = _callbacks()
        callbacks = service.DirectToolExecutionCallbacks(
            **{
                **vars(callbacks),
                "build_direct_local_tool_config": lambda connector_id, action_id, arguments: (
                    "read",
                    {"connector": connector_id, "action": action_id},
                ),
            }
        )

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit, patch(
            "server_modules.skills_service._execute_safe_direct_local_tool_call",
            return_value="ok",
        ):
            service.execute_single_direct_tool_call(
                tool_call={"name": "shell_exec", "arguments": {"command": "ls -la ./docs"}},
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
            )

        metadata = emit_audit.call_args_list[0].kwargs["metadata"]
        self.assertEqual(metadata["action_class"], "shell_execute")
        self.assertEqual(metadata["risk_level"], "high")
        self.assertEqual(metadata["governance_boundary"], "local_shell")
        self.assertTrue(metadata["requires_approval"])
        self.assertEqual(metadata["approval_reason"], "Shell execution")
        self.assertEqual(metadata["argument_target"], "ls -la ./docs")

    def test_execute_single_direct_tool_call_emits_governance_metadata_for_browser_mutation(self) -> None:
        callbacks = _callbacks()

        class _FakeBrowser:
            __empyralis_browser_adapter__ = True

            def run_sync(self, action, *args):
                return {"action": action, "args": list(args)}

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit, patch(
            "server_modules.skills_service._resolve_direct_tool_browser_adapter",
            return_value=_FakeBrowser(),
        ):
            service.execute_single_direct_tool_call(
                tool_call={"name": "browser__fill", "arguments": {"selector": "#email", "value": "test@example.com"}},
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
            )

        metadata = emit_audit.call_args_list[0].kwargs["metadata"]
        self.assertEqual(metadata["action_class"], "browser_mutation")
        self.assertEqual(metadata["risk_level"], "high")
        self.assertEqual(metadata["governance_boundary"], "browser_session")
        self.assertTrue(metadata["requires_approval"])
        self.assertEqual(metadata["approval_reason"], "Browser mutation")
        self.assertEqual(metadata["argument_target"], "#email")

    def test_execute_single_direct_tool_call_uses_broker_guard_for_execute_actions(self) -> None:
        callbacks = _callbacks()
        callbacks = service.DirectToolExecutionCallbacks(
            **{
                **vars(callbacks),
                "build_direct_local_tool_config": lambda connector_id, action_id, arguments: (
                    "read",
                    {"connector": connector_id, "action": action_id},
                ),
            }
        )

        with patch.dict(os.environ, {"EMPYRALIS_TOOL_BROKER_EXECUTE_LIMIT": "1"}, clear=False), patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit, patch(
            "server_modules.skills_service._execute_safe_direct_local_tool_call",
            return_value="ok",
        ):
            first = service.execute_single_direct_tool_call(
                tool_call={"name": "shell_exec", "arguments": {"command": "echo one"}},
                workspace_id="workspace-1",
                thread_id="thread-1",
                callbacks=callbacks,
                session_ctx={"tenant_id": "tenant-1", "request_id": "req-guard"},
            )
            self.assertEqual(first, "ok")
            with self.assertRaises(RuntimeError):
                service.execute_single_direct_tool_call(
                    tool_call={"name": "shell_exec", "arguments": {"command": "echo two"}},
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1", "request_id": "req-guard"},
                )

        self.assertIn("direct_tool.blocked", [call.kwargs["action"] for call in emit_audit.call_args_list])

    def test_execute_single_direct_tool_call_emits_failed_audit_event(self) -> None:
        callbacks = _callbacks()

        with patch(
            "server_modules.direct_tool_execution_service.security_audit_service.emit_security_audit_event"
        ) as emit_audit:
            with self.assertRaises(RuntimeError):
                service.execute_single_direct_tool_call(
                    tool_call={"name": "http_request", "arguments": {"url": "https://example.com"}},
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1", "request_id": "req-1"},
                )

        self.assertEqual([call.kwargs["action"] for call in emit_audit.call_args_list], [
            "direct_tool.started",
            "direct_tool.failed",
        ])
        self.assertEqual(emit_audit.call_args_list[1].kwargs["metadata"]["error_type"], "RuntimeError")

    def test_execute_single_direct_tool_call_handles_sage_service_tools(self) -> None:
        callbacks = _callbacks()
        callbacks = service.DirectToolExecutionCallbacks(
            **{
                **vars(callbacks),
                "run_async_tool_call": lambda awaitable: asyncio.run(awaitable),
            }
        )
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with (
                patch("server_modules.sage_services_service.workspace_context.workspace_scope_dir", return_value=root),
                patch(
                    "server_modules.sage_services_service.personal_context_engine.publish_event",
                    new=AsyncMock(return_value={"id": "evt-1"}),
                ),
            ):
                created_raw = service.execute_single_direct_tool_call(
                    tool_call={
                        "name": "sage_service__create_entry",
                        "arguments": {
                            "service_id": "nutrition_log",
                            "entry": {
                                "meal": "Lunch",
                                "calories": 650,
                                "protein_grams": 42,
                            },
                            "explicit_user_intent": True,
                        },
                    },
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1"},
                )
                listed_raw = service.execute_single_direct_tool_call(
                    tool_call={
                        "name": "sage_service__list_state",
                        "arguments": {"service_id": "nutrition_log"},
                    },
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1"},
                )

        created = json.loads(created_raw)
        listed = json.loads(listed_raw)
        self.assertEqual(created["entries"][0]["meal"], "Lunch")
        self.assertEqual(listed["entries"][0]["protein_grams"], 42)

    def test_execute_direct_tool_calls_aggregates_non_empty_results(self) -> None:
        raw = service.execute_direct_tool_calls(
            tool_calls=[{"name": "one"}, {"name": "two"}],
            workspace_id="default",
            thread_id="thread-1",
            execute_single_tool_call=lambda **kwargs: kwargs["tool_call"]["name"],
        )

        self.assertEqual(raw, "one\n\ntwo")


if __name__ == "__main__":
    unittest.main()
