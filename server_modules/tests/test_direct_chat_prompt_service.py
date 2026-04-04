import unittest

from server_modules import direct_chat_prompt_service


class DirectChatPromptServiceTests(unittest.TestCase):
    def test_memory_recall_section_only_appears_when_memory_tools_are_available(self) -> None:
        section = direct_chat_prompt_service.memory_recall_section(
            [{"name": "memory_search"}, {"name": "memory_get"}],
            memory_tool_names={"memory_search", "memory_get"},
        )
        self.assertIn("## Memory Recall", section)
        self.assertIn("run memory_search", section)

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
        self.assertIn("## Memory Recall", str(prompt))

    def test_combine_workspace_context_prefers_context_then_prompt(self) -> None:
        combined = direct_chat_prompt_service.combine_workspace_context(
            system_prompt="Base prompt",
            workspace_context_text="Workspace context",
        )
        self.assertEqual(combined, "Workspace context\n\nBase prompt")

        context_only = direct_chat_prompt_service.combine_workspace_context(
            system_prompt=None,
            workspace_context_text="Workspace context",
        )
        self.assertEqual(context_only, "Workspace context")


if __name__ == "__main__":
    unittest.main()
