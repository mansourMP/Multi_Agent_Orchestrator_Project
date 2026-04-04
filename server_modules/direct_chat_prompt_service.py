from __future__ import annotations

from typing import Any, Callable


def memory_recall_section(tools: list[dict[str, Any]], *, memory_tool_names: set[str]) -> str:
    available = {
        str(item.get("name") or "").strip()
        for item in tools
        if isinstance(item, dict)
    }
    if not (memory_tool_names & available):
        return ""
    return (
        "## Memory Recall\n"
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: "
        "run memory_search on MEMORY.md + memory/*.md, then use memory_get to read only the needed lines. "
        "If memory results are weak, say you checked."
    )


def build_system_prompt(
    *,
    workspace_id: str,
    availability: dict[str, Any],
    tools: list[dict[str, Any]],
    availability_lines: Callable[[str, dict[str, Any]], list[str]],
    build_operator_system_prompt: Callable[..., str],
    memory_tool_names: set[str],
) -> str | None:
    tool_lines = [
        f"{str(item.get('name') or '').strip()}: {str(item.get('description') or '').strip()}"
        for item in tools
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    ]
    base_prompt = build_operator_system_prompt(
        availability_lines(workspace_id, availability),
        tool_lines=tool_lines,
    )
    sections = [base_prompt.strip()] if str(base_prompt or "").strip() else []
    memory_section = memory_recall_section(tools, memory_tool_names=memory_tool_names)
    if memory_section:
        sections.append(memory_section)
    prompt = "\n\n".join(section for section in sections if section).strip()
    return prompt or None


def combine_workspace_context(*, system_prompt: str | None, workspace_context_text: str) -> str | None:
    context = str(workspace_context_text or "").strip()
    prompt = str(system_prompt or "").strip()
    if context and prompt:
        return f"{context}\n\n{prompt}"
    if context:
        return context
    return prompt or None
