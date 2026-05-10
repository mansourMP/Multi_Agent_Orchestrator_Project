from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Callable


def tool_prompt_lines(tools: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for item in tools:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        if not name:
            continue
        lines.append(f"{name}: {description}" if description else name)
    return lines


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
        "If memory results are weak, say you checked. When the user explicitly asks Sage to remember, correct, "
        "or update durable memory, read the current file first, then use memory_update with the complete revised "
        "Markdown content. For short durable memory captures, use memory_append_daily_note to append one note to "
        "today's daily file only; never append secrets, raw transcripts, or temporary noise. For consolidation "
        "drafts, use memory_stage_consolidation to stage proposals under memory/.dreams/ only. For safe merge "
        "planning/execution from daily notes, use memory_consolidate_daily_notes with explicit approval/policy flags. "
        "Use memory_list_versions for audit/version history and memory_rollback_version only when explicitly requested."
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
    tool_lines = tool_prompt_lines(tools)
    base_prompt = build_operator_system_prompt(
        availability_lines(workspace_id, availability),
        tool_lines=tool_lines,
    )
    sections = [base_prompt.strip()] if str(base_prompt or "").strip() else []
    if tool_lines:
        sections.append(
            "## Tool Use Rules\n"
            "If the user's request clearly requires a listed tool, use that tool instead of answering from general knowledge.\n"
            "Do not say you lack filesystem, browser, desktop, clipboard, shell, web, or connector access when a matching tool is available in the tool list.\n"
            "For local machine requests like files on the Desktop, screenshots, terminal commands, browser actions, or clipboard work, call the matching local tool first."
        )
    memory_section = memory_recall_section(tools, memory_tool_names=memory_tool_names)
    if memory_section:
        sections.append(memory_section)
    prompt = "\n\n".join(section for section in sections if section).strip()
    return prompt or None


def combine_workspace_context(
    *,
    system_prompt: str | None,
    workspace_context_text: str,
    identity_guardrail: str | None = None,
) -> str | None:
    context = str(workspace_context_text or "").strip()
    prompt = str(system_prompt or "").strip()
    guardrail = str(identity_guardrail or "").strip()
    if context and not prompt and not guardrail:
        return context
    sections: list[str] = []
    if prompt:
        sections.append(prompt)
    if guardrail:
        sections.append(guardrail)
    if context:
        sections.append(f"## Workspace Context\n{context}")
    if sections:
        return "\n\n".join(sections)
    return None


def build_runtime_identity_guardrail(*, provider: str, model: str | None = None) -> str:
    provider_label = str(provider or "").strip() or "the active provider"
    model_label = str(model or "").strip()
    if model_label:
        identity_line = f"If the user asks which model is answering, state exactly: provider {provider_label}, model {model_label}."
    else:
        identity_line = (
            f"If the user asks which model is answering, state that this turn is routed through provider {provider_label} "
            "and that the exact model id is not exposed to this turn."
        )
    return (
        "## Runtime Identity\n"
        "Never claim to be Claude, Anthropic, OpenAI, Gemini, or any other vendor-specific assistant unless the current runtime metadata explicitly matches that identity.\n"
        f"{identity_line}\n"
        "If you do not know the exact model id, say so plainly instead of guessing."
    )


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
