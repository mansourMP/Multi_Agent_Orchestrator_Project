import asyncio
import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

from server_modules import direct_tool_execution_service
from server_modules import skills_service


class SkillsServiceTests(unittest.TestCase):
    def _execution_callbacks(self) -> direct_tool_execution_service.DirectToolExecutionCallbacks:
        return direct_tool_execution_service.DirectToolExecutionCallbacks(
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
            build_direct_local_tool_config=skills_service.build_direct_local_tool_config,
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

    def test_capability_descriptor_from_payload_normalizes_fields(self) -> None:
        descriptor = skills_service.capability_descriptor_from_payload(
            {
                "id": " Slack ",
                "label": " Slack Live ",
                "connected": True,
                "authenticated": True,
                "runtime_usable": False,
                "read_actions": [" history.read ", ""],
                "write_actions": [" post_message "],
                "approval_required_actions": ["post_message", "post_message"],
            }
        )

        assert descriptor is not None
        self.assertEqual(descriptor.capability_id, "slack")
        self.assertEqual(descriptor.label, "Slack Live")
        self.assertTrue(descriptor.requires_approval)
        self.assertEqual(descriptor.risk_level, "medium")
        self.assertEqual(descriptor.metadata["read_actions"], ["history.read"])
        self.assertEqual(descriptor.metadata["write_actions"], ["post_message"])
        self.assertEqual(descriptor.metadata["approval_required_actions"], ["post_message"])

    def test_normalize_capability_payloads_filters_invalid_items(self) -> None:
        payload = skills_service.normalize_capability_payloads(
            [
                {"id": "browser", "connected": True},
                {"id": ""},
                "skip",
            ]
        )

        self.assertEqual(
            payload,
            [
                {
                    "id": "browser",
                    "label": "browser",
                    "risk_level": "medium",
                    "requires_approval": False,
                    "connected": True,
                    "authenticated": None,
                    "runtime_usable": None,
                    "read_actions": [],
                    "write_actions": [],
                    "approval_required_actions": [],
                }
            ],
        )

    def test_resolve_workspace_capability_payloads_normalizes_resolver_result(self) -> None:
        payload = skills_service.resolve_workspace_capability_payloads(
            "workspace-a",
            resolve_workspace_tool_capabilities_fn=lambda workspace_id: [
                {"id": " Gmail ", "workspace_id": workspace_id, "connected": True}
            ],
        )

        self.assertEqual(payload[0]["id"], "gmail")
        self.assertEqual(payload[0]["connected"], True)

    def test_availability_capability_helpers_read_normalized_payload(self) -> None:
        availability = {
            "tool_capabilities": [
                {"id": " Browser ", "connected": True, "runtime_usable": False},
            ]
        }

        self.assertEqual(skills_service.availability_capability(availability, "browser")["id"], "browser")
        self.assertTrue(skills_service.availability_capability_connected(availability, "browser"))
        self.assertFalse(skills_service.availability_capability_runtime_usable(availability, "browser"))
        self.assertIsNone(skills_service.availability_capability(availability, "missing"))

    def test_capability_action_helpers_normalize_write_and_approval_actions(self) -> None:
        availability = {
            "tool_capabilities": [
                {
                    "id": " Slack ",
                    "connected": True,
                    "write_actions": [" post_message ", "send_dm", "post_message"],
                    "approval_required_actions": [" send_dm "],
                },
            ]
        }

        self.assertEqual(
            skills_service.availability_capability_write_actions(availability, "slack"),
            ["post_message", "send_dm"],
        )
        self.assertEqual(
            skills_service.availability_capability_approval_required_actions(availability, "slack"),
            ["send_dm"],
        )
        self.assertTrue(skills_service.availability_capability_supports_write_action(availability, "slack", "post_message"))
        self.assertTrue(
            skills_service.availability_capability_requires_approval_for_action(
                availability,
                "slack",
                "send_dm",
            )
        )
        self.assertFalse(
            skills_service.availability_capability_supports_write_action(
                {"tool_capabilities": [{"id": "slack", "connected": False, "write_actions": ["post_message"]}]},
                "slack",
                "post_message",
            )
        )

    def test_connected_and_context_availability_helpers(self) -> None:
        availability = {
            "tool_capabilities": [
                {
                    "id": "slack",
                    "label": "Slack",
                    "connected": True,
                    "runtime_usable": True,
                    "read_actions": ["history.read", "channels.read"],
                    "write_actions": ["post_message", "send_dm"],
                    "approval_required_actions": ["post_message"],
                },
                {
                    "id": "telegram",
                    "label": "Telegram",
                    "connected": True,
                    "runtime_usable": None,
                },
                {
                    "id": "dropbox",
                    "label": "Dropbox",
                    "connected": True,
                    "runtime_usable": False,
                },
                {"id": "github", "label": "GitHub", "connected": False},
            ]
        }

        self.assertEqual(skills_service.connected_availability_labels(availability), ["Slack", "Telegram", "Dropbox"])
        self.assertEqual(skills_service.unavailable_connected_availability_labels(availability), ["Dropbox"])
        self.assertEqual(skills_service.unverified_connected_availability_labels(availability), ["Telegram"])
        context_payload = skills_service.context_availability_capabilities(
            availability,
            max_context_tool_actions=1,
            max_context_tool_capabilities=2,
        )
        self.assertEqual(len(context_payload), 2)
        self.assertEqual(context_payload[0]["read_actions"], ["history.read"])
        self.assertEqual(context_payload[0]["write_actions"], ["post_message"])

    def test_availability_label_summary_groups_connected_states(self) -> None:
        availability = {
            "tool_capabilities": [
                {"id": "slack", "label": "Slack", "connected": True, "runtime_usable": True},
                {"id": "telegram", "label": "Telegram", "connected": True, "runtime_usable": False},
                {"id": "gmail", "label": "Google Workspace", "connected": True, "runtime_usable": None},
                {"id": "github", "label": "GitHub", "connected": False},
            ]
        }

        summary = skills_service.availability_label_summary(availability)

        self.assertEqual(summary["connected"], ["Slack", "Telegram", "Google Workspace"])
        self.assertEqual(summary["usable"], ["Slack"])
        self.assertEqual(summary["unavailable"], ["Telegram"])
        self.assertEqual(summary["unverified"], ["Google Workspace"])

    def test_tool_registry_builds_connector_and_local_tools(self) -> None:
        connector_tools = skills_service.build_direct_chat_tools(
            [
                {
                    "id": "slack",
                    "label": "Slack",
                    "connected": True,
                    "runtime_usable": True,
                    "write_actions": ["post_message"],
                },
                {
                    "id": "dropbox",
                    "label": "Dropbox",
                    "connected": True,
                    "runtime_usable": False,
                    "write_actions": ["upload_file"],
                },
            ]
        )
        local_tools = skills_service.build_local_direct_chat_tools(
            {"runtime_ok": True},
            local_worker_available=lambda availability: True,
        )

        self.assertEqual([item["name"] for item in connector_tools], ["slack__post_message"])
        self.assertTrue(any(item["name"] == "file__read" for item in local_tools))
        self.assertTrue(any(item["name"] == "computer__click" for item in local_tools))
        file_read = next(item for item in local_tools if item["name"] == "file__read")
        computer_click = next(item for item in local_tools if item["name"] == "computer__click")
        self.assertEqual(file_read["capability_id"], "filesystem.read")
        self.assertEqual(file_read["risk_level"], "medium")
        self.assertTrue(file_read["requires_approval"])
        self.assertEqual(computer_click["capability_id"], "computer_control.click")
        self.assertEqual(computer_click["risk_level"], "critical")
        self.assertTrue(computer_click["requires_approval"])

    def test_tool_registry_resolves_local_and_http_action_availability(self) -> None:
        self.assertTrue(skills_service.tool_write_action_available("file", "read", []))
        self.assertTrue(skills_service.tool_write_action_available("http", "request", []))
        self.assertFalse(skills_service.tool_write_action_available("browser", "click", []))

    def test_capability_action_metadata_tracks_approval_requirements(self) -> None:
        metadata = skills_service.capability_action_metadata(
            [
                {
                    "id": "slack",
                    "connected": True,
                    "runtime_usable": True,
                    "write_actions": ["post_message"],
                    "approval_required_actions": ["post_message"],
                }
            ],
            "slack",
            "post_message",
        )

        self.assertTrue(metadata["connected"])
        self.assertTrue(metadata["runtime_usable"])
        self.assertTrue(metadata["supports_write_action"])
        self.assertTrue(metadata["requires_approval"])
        self.assertTrue(
            skills_service.tool_action_requires_approval(
                "slack",
                "post_message",
                [
                    {
                        "id": "slack",
                        "connected": True,
                        "runtime_usable": True,
                        "write_actions": ["post_message"],
                        "approval_required_actions": ["post_message"],
                    }
                ],
            )
        )

    def test_approved_action_to_tool_call_uses_registry_lookup(self) -> None:
        http_payload = skills_service.approved_action_to_tool_call(
            {"connector": "http", "action": "request", "input": "{\"url\":\"https://example.com\"}"},
            parse_json_object_loose=lambda value: json.loads(value),
        )
        connector_payload = skills_service.approved_action_to_tool_call(
            {"connector": "slack", "action": "post_message", "input": "hello"},
            parse_json_object_loose=lambda value: {},
        )

        self.assertEqual(http_payload["name"], "http_request")
        self.assertIn("https://example.com", http_payload["arguments"])
        self.assertEqual(connector_payload["name"], "slack__post_message")
        self.assertEqual(json.loads(connector_payload["arguments"]), {"input": "hello"})

    def test_build_direct_tool_config_builds_google_workspace_email_payload(self) -> None:
        payload = skills_service.build_direct_tool_config(
            "google_workspace",
            "send_email",
            "to john@example.com subject Demo body Hello there",
            parse_json_object_loose=lambda value: {},
        )

        self.assertEqual(payload["to_email"], "john@example.com")
        self.assertEqual(payload["subject"], "Demo")
        self.assertEqual(payload["text"], "Hello there")

    def test_build_direct_local_tool_config_requires_computer_click_target(self) -> None:
        with self.assertRaises(RuntimeError):
            skills_service.build_direct_local_tool_config("computer", "click", {})

    def test_execute_single_direct_tool_call_dispatches_memory_tools(self) -> None:
        callbacks = self._execution_callbacks()

        search_raw = skills_service.execute_single_direct_tool_call(
            tool_call={"name": "memory_search", "arguments": {"query": "timezone", "max_results": 3}},
            workspace_id="default",
            thread_id="thread-1",
            callbacks=callbacks,
        )
        get_raw = skills_service.execute_single_direct_tool_call(
            tool_call={"name": "memory_get", "arguments": {"path": "MEMORY.md", "from": 2, "lines": 4}},
            workspace_id="default",
            thread_id="thread-1",
            callbacks=callbacks,
        )

        self.assertEqual(json.loads(search_raw)["results"][0]["query"], "timezone")
        self.assertEqual(json.loads(search_raw)["results"][0]["max_results"], 3)
        self.assertEqual(json.loads(get_raw)["path"], "MEMORY.md")
        self.assertEqual(json.loads(get_raw)["from_line"], 2)

    def test_build_builtin_direct_chat_tools_includes_sage_service_tools(self) -> None:
        tool_names = {
            item["name"]
            for item in skills_service.build_builtin_direct_chat_tools()
            if isinstance(item, dict)
        }

        self.assertIn("sage_service__list_state", tool_names)
        self.assertIn("sage_service__update_profile", tool_names)
        self.assertIn("sage_service__create_entry", tool_names)

    def test_execute_single_direct_tool_call_dispatches_sage_service_tools(self) -> None:
        callbacks = self._execution_callbacks()
        callbacks = direct_tool_execution_service.DirectToolExecutionCallbacks(
            **{
                **callbacks.__dict__,
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
                profile_raw = skills_service.execute_single_direct_tool_call(
                    tool_call={
                        "name": "sage_service__update_profile",
                        "arguments": {
                            "service_id": "language_coach",
                            "profile": {
                                "target_language": "Japanese",
                                "current_level": "A2",
                                "focus_area": "Travel",
                            },
                        },
                    },
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1"},
                )
                entry_raw = skills_service.execute_single_direct_tool_call(
                    tool_call={
                        "name": "sage_service__create_entry",
                        "arguments": {
                            "service_id": "flashcards",
                            "entry": {
                                "deck": "M&A",
                                "front": "SPA",
                                "back": "Share Purchase Agreement",
                            },
                        },
                    },
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1"},
                )
                state_raw = skills_service.execute_single_direct_tool_call(
                    tool_call={
                        "name": "sage_service__list_state",
                        "arguments": {"service_id": "flashcards"},
                    },
                    workspace_id="workspace-1",
                    thread_id="thread-1",
                    callbacks=callbacks,
                    session_ctx={"tenant_id": "tenant-1"},
                )

        profile_payload = json.loads(profile_raw)
        entry_payload = json.loads(entry_raw)
        state_payload = json.loads(state_raw)
        self.assertEqual(profile_payload["profile"]["target_language"], "Japanese")
        self.assertEqual(entry_payload["entries"][0]["front"], "SPA")
        self.assertEqual(state_payload["entries"][0]["back"], "Share Purchase Agreement")


if __name__ == "__main__":
    unittest.main()
