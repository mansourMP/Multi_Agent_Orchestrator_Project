import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from server_modules import direct_tool_execution_service as service


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
