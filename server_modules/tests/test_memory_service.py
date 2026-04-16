import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from server_modules import memory_service, workspace_context


class MemoryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="memory-service-")
        self.addCleanup(self._tmpdir.cleanup)
        tmp_root = Path(self._tmpdir.name)
        self._workspace_root = tmp_root / "workspace"
        self._workspace_root.mkdir(parents=True, exist_ok=True)
        self._memory_root = tmp_root / "runtime-memory"
        self._workspace_patch = patch.object(workspace_context, "_WORKSPACE_DIR", self._workspace_root)
        self._memory_patch = patch.object(memory_service._workspace_memory_store, "_MEMORY_DIR", self._memory_root)
        self._semantic_model_patch = patch.object(memory_service._workspace_memory_store, "_SEMANTIC_MODEL", False)
        self._workspace_patch.start()
        self._memory_patch.start()
        self._semantic_model_patch.start()
        self.addCleanup(self._workspace_patch.stop)
        self.addCleanup(self._memory_patch.stop)
        self.addCleanup(self._semantic_model_patch.stop)

    def test_workspace_memory_snapshot_contains_entries_and_text(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_memory("default", "preferred_editor", "Neovim")

        snapshot = memory_service.workspace_memory_snapshot("default")

        self.assertEqual(snapshot.workspace_id, "default")
        self.assertEqual(snapshot.entries[0]["key"], "preferred_editor")
        self.assertIn("- preferred_editor: Neovim", snapshot.text)
        self.assertEqual(snapshot.as_payload()["workspace_id"], "default")

    def test_publish_hybrid_summary_bridge_payload_persists_and_reports_last_safe_status(self) -> None:
        record = memory_service.publish_hybrid_summary_bridge_payload(
            "default",
            payload_class="bounded_local_private_summaries",
            summary="Local notes summarized into a cloud-safe snapshot.",
            items=[
                {
                    "kind": "local_context",
                    "label": "Notebook",
                    "summary": "Two private notes were reduced into one safe summary.",
                    "source_count": 2,
                }
            ],
            memory_layer="local_private_memory",
            source_runtime_mode="local_secure",
            last_safe=True,
        )

        records = memory_service.list_hybrid_summary_bridge_payloads("default")
        status = memory_service.hybrid_summary_bridge_status("default")

        self.assertEqual(record["payload_class"], "bounded_local_private_summaries")
        self.assertEqual(len(records), 1)
        self.assertTrue(status["last_safe_summary_available"])
        self.assertEqual(status["available_payload_classes"], ["bounded_local_private_summaries"])

    def test_publish_hybrid_summary_bridge_payload_rejects_forbidden_shape(self) -> None:
        with self.assertRaises(Exception) as error:
            memory_service.publish_hybrid_summary_bridge_payload(
                "default",
                payload_class="artifact_summaries",
                summary="Attempted unsafe publish.",
                items=[
                    {
                        "label": "Artifact",
                        "summary": "Unsafe raw artifact body.",
                        "raw_content": "secret body",
                    }
                ],
                source_runtime_mode="local_secure",
            )

        self.assertIn("raw-content fields", str(error.exception))

    def test_publish_hybrid_summary_bridge_payload_rejects_disallowed_payload_class(self) -> None:
        with self.assertRaises(Exception) as error:
            memory_service.publish_hybrid_summary_bridge_payload(
                "default",
                payload_class="full_local_specialist_internals",
                summary="Unsafe payload class.",
                source_runtime_mode="local_secure",
            )

        self.assertIn("not allowed", str(error.exception))

    def test_query_memory_returns_matching_items_and_context_blocks(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_memory("default", "favorite_drink", "tea")
        memory_service.save_daily_log("default", "Reviewed the canonical runtime convergence work.")

        result = memory_service.query_memory(
            memory_service.MemoryQuery(
                workspace_id="default",
                session_id="thread-1",
                text="timezone",
            )
        )

        self.assertTrue(any(item.metadata.get("key") == "timezone" for item in result.items))
        self.assertTrue(any(block.startswith("Runtime Memory Facts") for block in result.context_blocks))
        self.assertTrue(any(block.startswith("Recent Daily Logs") for block in result.context_blocks))

    def test_runtime_memory_search_wraps_runtime_subsystem_results(self) -> None:
        with patch.object(memory_service, "_memory_manager_or_503", return_value=object()) as manager_mock, patch.object(
            memory_service,
            "_normalize_memory_bucket",
            return_value="session",
        ) as bucket_mock, patch.object(
            memory_service,
            "_runtime_workspace_id",
            return_value="default",
        ) as workspace_mock, patch.object(
            memory_service,
            "_memory_search_scoped",
            return_value=[{"id": "mem-1", "text": "remember this", "metadata": {"bucket": "session"}}],
        ) as scoped_mock:
            result = memory_service.runtime_memory_search(
                query="remember",
                bucket="session",
                workspace_id="default",
                profile_id="profile-1",
                project_id="project-1",
                session_key="session-1",
                k=4,
            )

        manager_mock.assert_called_once_with()
        bucket_mock.assert_called_once_with("session", required=False)
        workspace_mock.assert_called_once_with("default")
        scoped_mock.assert_called_once_with(
            query="remember",
            bucket="session",
            workspace_id="default",
            agent_install_id=None,
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            k=4,
        )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "mem-1")

    def test_runtime_memory_upsert_wraps_runtime_subsystem_manager(self) -> None:
        manager = type("Manager", (), {"upsert_memory": lambda self, text, metadata: metadata.get("id") or "mem-2"})()
        with patch.object(memory_service, "_memory_manager_or_503", return_value=manager) as manager_mock, patch.object(
            memory_service,
            "_normalize_memory_bucket",
            return_value="session",
        ) as bucket_mock, patch.object(
            memory_service,
            "_runtime_workspace_id",
            return_value="default",
        ) as workspace_mock, patch.object(
            memory_service,
            "_runtime_utc_now",
            return_value=datetime(2026, 4, 4, tzinfo=timezone.utc),
        ), patch.object(
            memory_service.runtime_memory,
            "ORION_MEMORY_RETENTION_DAYS_DEFAULT",
            30,
        ):
            result = memory_service.runtime_memory_upsert(
                text="Remember the current customer migration plan.",
                bucket="session",
                workspace_id="default",
                profile_id="profile-1",
                project_id="project-1",
                session_key="session-1",
                source="api",
                retention_days=14,
                metadata={"source_kind": "test"},
                memory_id="mem-2",
            )

        manager_mock.assert_called_once_with()
        bucket_mock.assert_called_once_with("session", required=True)
        workspace_mock.assert_called_once_with("default")
        self.assertEqual(result["id"], "mem-2")
        self.assertEqual(result["bucket"], "session")
        self.assertEqual(result["workspace_id"], "default")
        self.assertEqual(result["retention_days"], 14)
        self.assertTrue(str(result["expires_at"]).endswith("Z"))

    def test_memory_search_scoped_hides_other_install_namespaces_by_default(self) -> None:
        manager = type(
            "Manager",
            (),
            {
                "search_memory": lambda self, query, limit: [
                    {"id": "shared", "text": "shared context", "metadata": {"bucket": "session", "workspace_id": "default"}},
                    {
                        "id": "install-a",
                        "text": "specialist A context",
                        "metadata": {"bucket": "session", "workspace_id": "default", "agent_install_id": "install-a"},
                    },
                    {
                        "id": "install-b",
                        "text": "specialist B context",
                        "metadata": {"bucket": "session", "workspace_id": "default", "agent_install_id": "install-b"},
                    },
                ]
            },
        )()

        with patch.object(memory_service.runtime_memory, "_memory_manager", return_value=manager), patch.object(
            memory_service,
            "_runtime_utc_now",
            return_value=datetime(2026, 4, 4, tzinfo=timezone.utc),
        ):
            items = memory_service._memory_search_scoped(
                "context",
                bucket="session",
                workspace_id="default",
                agent_install_id="install-a",
                k=5,
            )

        self.assertEqual([item["id"] for item in items], ["shared", "install-a"])

    def test_hydrate_run_memory_context_uses_canonical_memory_service_search(self) -> None:
        run = {
            "logs": object(),
            "context": {
                "workspace_id": "default",
                "user_goal": "Find customer migration status",
                "metadata": {"profile_id": "profile-1", "active_agent_install_id": "install-specialist"},
            },
            "memory_trace": {"enabled": True, "reads": [], "writes": [], "last_error": None, "updated_at": None},
        }

        with patch.object(memory_service.runtime_memory, "ORION_MEMORY_ENABLED", True), patch.object(
            memory_service.runtime_memory,
            "_memory_manager",
            return_value=object(),
        ), patch.object(
            memory_service,
            "_memory_search_scoped",
            return_value=[{"id": "mem-1", "text": "customer migration active", "metadata": {"bucket": "profile"}}],
        ) as scoped_mock, patch.object(
            memory_service.runtime_memory,
            "_emit_log",
            return_value=None,
        ) as emit_log_mock, patch.object(
            memory_service.runtime_memory,
            "_compact_event_text",
            side_effect=lambda value, limit=800: str(value or "")[:limit],
        ), patch.object(
            memory_service,
            "_runtime_workspace_id",
            return_value="default",
        ), patch.object(
            memory_service,
            "_runtime_utc_now_iso",
            return_value="2026-04-04T00:00:00Z",
        ):
            memory_service._hydrate_run_memory_context("run-1", run)

        scoped_mock.assert_called()
        self.assertEqual(scoped_mock.call_args.kwargs["agent_install_id"], "install-specialist")
        self.assertEqual(run["context"]["metadata"]["memory_context"]["count"], 1)
        self.assertEqual(run["memory_trace"]["reads"][0]["bucket"], "profile")
        emit_log_mock.assert_called_once()

    def test_memory_scope_from_context_uses_active_install_only(self) -> None:
        with patch.object(memory_service, "_runtime_workspace_id", return_value="default"):
            scope_without_active = memory_service._memory_scope_from_context(
                {
                    "workspace_id": "default",
                    "metadata": {
                        "workspace_agent_install_id": "install-parent",
                    },
                }
            )
            self.assertEqual(scope_without_active["agent_install_id"], "")

            scope_with_active = memory_service._memory_scope_from_context(
                {
                    "workspace_id": "default",
                    "metadata": {
                        "active_agent_install_id": "install-child",
                        "workspace_agent_install_id": "install-parent",
                    },
                }
            )
        self.assertEqual(scope_with_active["agent_install_id"], "install-child")

    def test_persist_run_memory_uses_canonical_memory_service_write_path(self) -> None:
        writes = []
        manager = type(
            "Manager",
            (),
            {"upsert_memory": lambda self, text, metadata: writes.append((text, metadata)) or f"mem-{len(writes)}"},
        )()
        run = {
            "status": "completed",
            "engine": "orion",
            "logs": object(),
            "result": "Customer migration completed.",
            "context": {
                "workspace_id": "default",
                "user_goal": "Complete customer migration",
                "metadata": {
                    "profile_id": "profile-1",
                    "project_id": "project-1",
                    "active_agent_install_id": "install-specialist",
                },
            },
            "memory_trace": {"enabled": True, "reads": [], "writes": [], "last_error": None, "updated_at": None},
        }

        with patch.object(memory_service.runtime_memory, "ORION_MEMORY_ENABLED", True), patch.object(
            memory_service.runtime_memory,
            "_memory_manager",
            return_value=manager,
        ), patch.object(
            memory_service.runtime_memory,
            "MEMORY_BUCKETS",
            {"session", "project", "profile"},
        ), patch.object(
            memory_service.runtime_memory,
            "_emit_log",
            return_value=None,
        ) as emit_log_mock, patch.object(
            memory_service.runtime_memory,
            "_refresh_archived_run_snapshot",
            return_value=None,
        ), patch.object(
            memory_service.runtime_memory,
            "_json_safe",
            side_effect=lambda value: value,
        ), patch.object(
            memory_service.runtime_memory,
            "_compact_event_text",
            side_effect=lambda value, limit=800: str(value or "")[:limit],
        ), patch.object(
            memory_service,
            "_runtime_utc_now",
            return_value=datetime(2026, 4, 4, tzinfo=timezone.utc),
        ), patch.object(
            memory_service,
            "_runtime_workspace_id",
            return_value="default",
        ), patch.object(
            memory_service,
            "_runtime_utc_now_iso",
            return_value="2026-04-04T00:00:00Z",
        ):
            memory_service._persist_run_memory("run-1", run)

        self.assertEqual(len(writes), 3)
        self.assertTrue(all(metadata.get("agent_install_id") == "install-specialist" for _text, metadata in writes))
        self.assertEqual(run["memory_trace"]["writes"][-1]["bucket"], "profile")
        emit_log_mock.assert_called_once()

    def test_direct_chat_workspace_context_text_reads_install_namespace_when_requested(self) -> None:
        workspace_context.write_workspace_context_file("SOUL.md", "Shared soul.\n")
        workspace_context.write_workspace_context_file(
            "SOUL.md",
            "Specialist soul.\n",
            workspace_id="default",
            agent_install_id="install-specialist",
        )
        memory_service.save_memory("default", "shared_key", "shared value")
        memory_service.save_memory("default", "private_key", "private value", agent_install_id="install-specialist")
        memory_service.save_daily_log("default", "Shared log entry.")
        memory_service.save_daily_log("default", "Private log entry.", agent_install_id="install-specialist")

        text = memory_service.direct_chat_workspace_context_text(
            "default",
            memory_query="private",
            agent_install_id="install-specialist",
        )

        self.assertIn("Specialist soul.", text)
        self.assertNotIn("Shared soul.", text)
        self.assertIn("private value", text)
        self.assertNotIn("shared value", text)
        self.assertIn("Private log entry.", text)
        self.assertNotIn("Shared log entry.", text)

    def test_direct_chat_workspace_context_text_collects_context_logs_and_memory(self) -> None:
        workspace_context.write_workspace_context_file("SOUL.md", "Stay concise.\n")
        workspace_context.write_workspace_context_file("USER.md", "Owner prefers async updates.\n")
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_daily_log("default", "Reviewed the canonical architecture document.")

        text = memory_service.direct_chat_workspace_context_text("default", memory_query="timezone")

        self.assertIn("SOUL.md", text)
        self.assertIn("USER.md", text)
        self.assertIn("Recent Daily Logs", text)
        self.assertIn("Runtime Memory Facts", text)
        self.assertIn("timezone", text)

    def test_direct_chat_memory_context_message_returns_system_payload(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")

        message = memory_service.direct_chat_memory_context_message(
            "default",
            system_prefix="Remember this:\n",
        )

        self.assertEqual(message["role"], "system")
        self.assertIn("Remember this:", message["content"])
        self.assertIn("Asia/Shanghai", message["content"])

    def test_store_direct_chat_memory_fact_hashes_and_normalizes_fact(self) -> None:
        memory_service.store_direct_chat_memory_fact("default", "  Mansur   prefers  concise updates.  ")

        entries = memory_service.list_memory_entries("default")
        self.assertEqual(len(entries), 1)
        self.assertTrue(str(entries[0]["key"]).startswith("fact-"))
        self.assertEqual(entries[0]["content"], "Mansur prefers concise updates.")

    def test_save_direct_chat_daily_log_summary_writes_recent_logs(self) -> None:
        summary = memory_service.save_direct_chat_daily_log_summary(
            workspace_id="default",
            user_message="Continue the architecture refactor.",
            assistant_reply="Moved chat memory helpers behind the service boundary.",
        )

        recent_logs = memory_service.get_recent_logs("default", days=7)
        self.assertIn("Continue the architecture refactor.", summary)
        self.assertIn("Moved chat memory helpers behind the service boundary.", recent_logs)

    def test_parse_direct_chat_memory_facts_dedupes_and_accepts_object_wrapper(self) -> None:
        facts = memory_service.parse_direct_chat_memory_facts(
            '{"facts":["Mansur prefers concise updates.","Mansur prefers concise updates.","Timezone is Asia/Shanghai."]}'
        )

        self.assertEqual(
            facts,
            [
                "Mansur prefers concise updates.",
                "Timezone is Asia/Shanghai.",
            ],
        )

    def test_persist_direct_chat_memory_best_effort_stores_log_and_extracted_facts(self) -> None:
        def fake_generate_reply(**kwargs):
            self.assertEqual(kwargs["context"]["source"], "chat_direct_memory_extract")
            self.assertEqual(kwargs["metadata"]["source"], "chat_direct_memory_extract")
            self.assertEqual(kwargs["user_goal"], "Extract durable facts.")
            self.assertEqual(kwargs["system_prompt"], "Return a JSON array.")
            self.assertEqual(kwargs["prior_messages"][-2]["role"], "user")
            self.assertEqual(kwargs["prior_messages"][-1]["role"], "assistant")
            return ('["Timezone is Asia/Shanghai.","Timezone is Asia/Shanghai."]', {}, "openai", "")

        memory_service.persist_direct_chat_memory_best_effort(
            workspace_id="default",
            provider="openai",
            model="gpt-test",
            credentials={"api_key": "sk-test"},
            reasoning_effort="medium",
            prior_messages=[{"role": "user", "content": "Earlier context."}],
            user_message="Remember the timezone.",
            assistant_reply="I will keep that in mind.",
            generate_reply=fake_generate_reply,
            extraction_prompt="Extract durable facts.",
            extraction_system_prompt="Return a JSON array.",
        )

        recent_logs = memory_service.get_recent_logs("default", days=7)
        entries = memory_service.list_memory_entries("default")

        self.assertIn("Remember the timezone.", recent_logs)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["content"], "Timezone is Asia/Shanghai.")

    def test_find_workspace_memory_entry_matches_key_or_content(self) -> None:
        memory_service.save_memory("default", "favorite_editor", "Neovim")
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")

        by_key = memory_service.find_workspace_memory_entry("default", "favorite editor")
        by_content = memory_service.find_workspace_memory_entry("default", "shanghai")

        self.assertEqual(by_key["key"], "favorite_editor")
        self.assertEqual(by_content["key"], "timezone")

    def test_memory_suggestion_prompts_uses_saved_context_entries(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_memory("default", "work_style", "async check-ins")

        prompts = memory_service.memory_suggestion_prompts("default", limit=2)

        self.assertEqual(len(prompts), 2)
        self.assertTrue(all(prompt.startswith("Use my saved context:") for prompt in prompts))

    def test_parse_no_provider_memory_write_normalizes_common_patterns(self) -> None:
        self.assertEqual(
            memory_service.parse_no_provider_memory_write("Remember my name is TestUser."),
            {"key": "name", "value": "TestUser", "display_key": "name"},
        )
        self.assertEqual(
            memory_service.parse_no_provider_memory_write("remember: Favorite Editor = Neovim."),
            {"key": "favorite_editor", "value": "Neovim", "display_key": "Favorite Editor"},
        )

    def test_parse_no_provider_memory_read_normalizes_name_and_lookup_patterns(self) -> None:
        self.assertEqual(memory_service.parse_no_provider_memory_read("What is my name"), "name")
        self.assertEqual(memory_service.parse_no_provider_memory_read("Recall favorite editor"), "favorite editor")
        self.assertEqual(
            memory_service.parse_no_provider_memory_read("What did I say about timezone"),
            "timezone",
        )

    def test_handle_no_provider_memory_request_handles_write_and_read_paths(self) -> None:
        write_reply = memory_service.handle_no_provider_memory_request("default", "Remember that timezone is Asia/Shanghai.")
        read_reply = memory_service.handle_no_provider_memory_request("default", "What is timezone")
        missing_reply = memory_service.handle_no_provider_memory_request("default", "What is favorite color")

        self.assertEqual(write_reply, "Stored memory: timezone = Asia/Shanghai")
        self.assertEqual(read_reply, "timezone = Asia/Shanghai")
        self.assertEqual(missing_reply, "I don't have favorite color saved in memory yet.")


if __name__ == "__main__":
    unittest.main()
