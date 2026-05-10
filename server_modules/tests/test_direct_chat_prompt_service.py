import unittest
from datetime import datetime, timezone

from server_modules import direct_chat_prompt_service


class DirectChatPromptServiceTests(unittest.TestCase):
    def test_tool_prompt_lines_include_name_and_description(self) -> None:
        self.assertEqual(
            direct_chat_prompt_service.tool_prompt_lines(
                [{"name": "file__read", "description": "Read a local file"}]
            ),
            ["file__read: Read a local file"],
        )

    def test_memory_recall_section_only_appears_when_memory_tools_are_available(self) -> None:
        section = direct_chat_prompt_service.memory_recall_section(
            [{"name": "memory_search"}, {"name": "memory_get"}],
            memory_tool_names={"memory_search", "memory_get"},
        )
        self.assertIn("## Memory Recall", section)
        self.assertIn("run memory_search", section)
        self.assertIn("memory_update", section)

        empty = direct_chat_prompt_service.memory_recall_section(
            [{"name": "web__search"}],
            memory_tool_names={"memory_search", "memory_get"},
        )
        self.assertEqual(empty, "")

    def test_build_system_prompt_includes_base_prompt_and_memory_section(self) -> None:
        prompt = direct_chat_prompt_service.build_system_prompt(
            workspace_id="default",
            availability={"ai_ready": True},
            tools=[
                {"name": "memory_search", "description": "Search memory"},
                {"name": "memory_get", "description": "Read memory excerpt"},
            ],
            availability_lines=lambda workspace_id, availability: [f"Workspace: {workspace_id}", "AI account: ready"],
            build_operator_system_prompt=lambda lines, tool_lines=None: "\n".join([*lines, *(tool_lines or [])]),
            memory_tool_names={"memory_search", "memory_get"},
        )

        self.assertIn("Workspace: default", str(prompt))
        self.assertIn("memory_search: Search memory", str(prompt))
        self.assertIn("## Tool Use Rules", str(prompt))
        self.assertIn("Do not say you lack filesystem", str(prompt))
        self.assertIn("## Memory Recall", str(prompt))

    def test_combine_workspace_context_prefers_prompt_then_context(self) -> None:
        combined = direct_chat_prompt_service.combine_workspace_context(
            system_prompt="Base prompt",
            workspace_context_text="Workspace context",
        )
        self.assertEqual(combined, "Base prompt\n\n## Workspace Context\nWorkspace context")

        context_only = direct_chat_prompt_service.combine_workspace_context(
            system_prompt=None,
            workspace_context_text="Workspace context",
        )
        self.assertEqual(context_only, "Workspace context")

    def test_combine_workspace_context_places_identity_before_workspace_context(self) -> None:
        combined = direct_chat_prompt_service.combine_workspace_context(
            system_prompt="Base prompt",
            workspace_context_text="Workspace context",
            identity_guardrail="Identity guardrail",
        )

        self.assertEqual(
            combined,
            "Base prompt\n\nIdentity guardrail\n\n## Workspace Context\nWorkspace context",
        )

    def test_time_of_day_suggestion_varies_by_hour(self) -> None:
        self.assertEqual(
            direct_chat_prompt_service.time_of_day_suggestion(
                now=datetime(2026, 4, 4, 9, 0, tzinfo=timezone.utc)
            ),
            "Review today's priorities and queue the next durable run.",
        )
        self.assertEqual(
            direct_chat_prompt_service.time_of_day_suggestion(
                now=datetime(2026, 4, 4, 14, 0, tzinfo=timezone.utc)
            ),
            "Check what is running now and clear any waiting approvals.",
        )

    def test_build_proactive_suggestions_dedupes_and_limits(self) -> None:
        suggestions = direct_chat_prompt_service.build_proactive_suggestions(
            "default",
            heartbeat_tasks=lambda: ["follow up with onboarding", "follow up with onboarding"],
            recent_run_prompts=lambda workspace_id: ["review the current runtime plan", "review the current runtime plan"],
            memory_suggestion_prompts=lambda workspace_id: ["Use my saved context: Asia/Shanghai"],
            now=datetime(2026, 4, 4, 9, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(len(suggestions), 3)
        self.assertEqual(suggestions[0], "Handle heartbeat task: follow up with onboarding")
        self.assertEqual(suggestions[1], "Continue: review the current runtime plan")
        self.assertEqual(suggestions[2], "Use my saved context: Asia/Shanghai")


if __name__ == "__main__":
    unittest.main()
