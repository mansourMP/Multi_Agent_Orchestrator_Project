from __future__ import annotations

from datetime import datetime
import re
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


def time_of_day_suggestion(*, now: datetime | None = None) -> str:
    hour = (now or datetime.now().astimezone()).hour
    if hour < 12:
        return "Review today's priorities and queue the next durable run."
    if hour < 18:
        return "Check what is running now and clear any waiting approvals."
    return "Wrap up open work and schedule the next task for tomorrow."


def build_proactive_suggestions(
    workspace_id: str,
    *,
    heartbeat_tasks: Callable[[], list[str]],
    recent_run_prompts: Callable[[str], list[str]],
    memory_suggestion_prompts: Callable[[str], list[str]],
    now: datetime | None = None,
) -> list[str]:
    suggestions: list[str] = []
    seen: set[str] = set()

    def push(value: str) -> None:
        text = re.sub(r"\s+", " ", str(value or "").strip())
        if not text:
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        suggestions.append(text)

    for task in heartbeat_tasks():
        push(f"Handle heartbeat task: {task}")

    for prompt in recent_run_prompts(workspace_id):
        push(f"Continue: {prompt[:120].rstrip()}")

    for prompt in memory_suggestion_prompts(workspace_id):
        push(prompt)

    push(time_of_day_suggestion(now=now))

    fallback_prompts = [
        "Summarize what you know about me and keep it concise.",
        "Review the latest runs and tell me what needs attention.",
        "Check pending approvals and suggest the next best action.",
    ]
    for item in fallback_prompts:
        push(item)
        if len(suggestions) >= 3:
            break
    return suggestions[:3]
