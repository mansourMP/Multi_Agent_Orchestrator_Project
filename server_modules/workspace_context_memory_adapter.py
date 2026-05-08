from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from server_modules.conversation_memory_policy import MemoryPolicyProfile
from server_modules.workspace_context import read_workspace_context_files


_RED_FACT_LINE_RE = re.compile(
    r"(^|\b)(red|critical_restricted|critical|secret|credential|api[_ -]?key|private[_ -]?key|password|token)\b",
    re.IGNORECASE,
)
_SECRET_VALUE_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9+/]{32,}={0,2}|-----BEGIN [A-Z ]*PRIVATE KEY-----)",
    re.IGNORECASE,
)


def strip_red_facts_from_external_context(text: str) -> str:
    lines: List[str] = []
    removed = 0
    for raw_line in str(text or "").splitlines():
        line = raw_line.rstrip()
        lowered = line.lower()
        red_tagged = (
            "[red]" in lowered
            or "sensitivity:red" in lowered
            or "sensitivity: red" in lowered
            or lowered.lstrip().startswith("red:")
            or lowered.lstrip().startswith("critical_restricted:")
        )
        if red_tagged or (_RED_FACT_LINE_RE.search(line) and _SECRET_VALUE_RE.search(line)):
            removed += 1
            continue
        lines.append(line)
    stripped = "\n".join(lines).strip()
    if removed:
        notice = f"[{removed} RED memory fact(s) stripped before external model context.]"
        return f"{stripped}\n{notice}".strip() if stripped else notice
    return stripped


def _append_external_safe_section(sections: List[str], title: str, content: str) -> None:
    sanitized = strip_red_facts_from_external_context(content)
    if sanitized:
        sections.append(f"{title}\n{sanitized}")


def load_workspace_context_payload(
    *,
    workspace_id: str,
    memory_query: str = "",
    agent_install_id: str | None = None,
    policy_profile: MemoryPolicyProfile,
) -> Dict[str, Any]:
    from server_modules import memory_service

    stable_sections: List[str] = []
    retrieved_sections: List[str] = []
    semantic_hits: List[Dict[str, Any]] = []
    mini_app_summary_count = 0
    try:
        context_files = read_workspace_context_files(
            workspace_id=workspace_id,
            agent_install_id=str(agent_install_id or "").strip() or None,
        )
    except Exception:
        context_files = {}

    for filename in ("SOUL.md", "USER.md", "IDENTITY.md", "HEARTBEAT.md", "MEMORY.md"):
        content = str(context_files.get(filename) or "").strip()
        if content:
            _append_external_safe_section(stable_sections, filename, content)

    recent_logs = memory_service.get_recent_logs(
        workspace_id,
        days=policy_profile.max_recent_log_days,
        agent_install_id=agent_install_id,
    )
    if recent_logs:
        _append_external_safe_section(retrieved_sections, "Recent Daily Logs", recent_logs[:6000].rstrip())

    normalized_query = str(memory_query or "").strip()
    if normalized_query:
        semantic_hits = list(
            memory_service.semantic_search(
                workspace_id,
                normalized_query,
                top_k=policy_profile.semantic_retrieval_k,
                agent_install_id=agent_install_id,
            )
        )
    if semantic_hits:
        memory_facts = "\n".join(
            f"- {str(item.get('key') or '').strip()}: {str(item.get('content') or '').strip()}"
            for item in semantic_hits
            if str(item.get("content") or "").strip()
        ).strip()
        memory_heading = "Retrieved Relevant Memory"
    else:
        memory_facts = memory_service.get_memory(workspace_id, agent_install_id=agent_install_id)
        memory_heading = "Runtime Memory Facts"
    if memory_facts:
        sanitized_memory_facts = strip_red_facts_from_external_context(memory_facts)
        if sanitized_memory_facts:
            target_sections = retrieved_sections if semantic_hits else stable_sections
            target_sections.append(f"{memory_heading}\n{sanitized_memory_facts}")

    if not agent_install_id:
        try:
            from server_modules import sage_memory_service

            memory_block = sage_memory_service.build_sage_memory_context_block(
                workspace_id=workspace_id,
            )
        except Exception:
            memory_block = ""
        if memory_block:
            _append_external_safe_section(stable_sections, "Sage Memory", memory_block)
        try:
            from server_modules import sage_services_service

            services_memory_block = sage_services_service.build_sage_services_memory_block(
                workspace_id=workspace_id,
            )
        except Exception:
            services_memory_block = ""
        if services_memory_block:
            _append_external_safe_section(stable_sections, "Sage Services", services_memory_block)
        try:
            from server_modules import mini_apps_service

            mini_apps_block = mini_apps_service.build_mini_apps_context_block(
                workspace_id=workspace_id,
            )
        except Exception:
            mini_apps_block = ""
        if mini_apps_block:
            _append_external_safe_section(stable_sections, "Mini App Summaries", mini_apps_block)
            mini_app_summary_count = mini_apps_block.count("\n[")

    sections = [*stable_sections, *retrieved_sections]
    return {
        "contextual_blocks": sections,
        "stable_contextual_blocks": stable_sections,
        "retrieved_contextual_blocks": retrieved_sections,
        "semantic_hits": semantic_hits,
        "diagnostics": {
            "context_file_count": sum(
                1
                for filename in ("SOUL.md", "USER.md", "IDENTITY.md", "HEARTBEAT.md", "MEMORY.md")
                if str(context_files.get(filename) or "").strip()
            ),
            "recent_log_days": policy_profile.max_recent_log_days,
            "semantic_hit_count": len(semantic_hits),
            "mini_app_summary_count": mini_app_summary_count,
            "stable_context_block_count": len(stable_sections),
            "retrieved_context_block_count": len(retrieved_sections),
        },
    }


def _sanitize_blocks(contextual_blocks: List[str]) -> List[str]:
    blocks = [
        strip_red_facts_from_external_context(str(block or "").strip())
        for block in contextual_blocks
        if str(block or "").strip()
    ]
    return [block for block in blocks if block]


def render_workspace_context_text(
    contextual_blocks: List[str],
    *,
    stable_blocks: Optional[List[str]] = None,
    retrieved_blocks: Optional[List[str]] = None,
) -> str:
    if stable_blocks is not None or retrieved_blocks is not None:
        stable = _sanitize_blocks(stable_blocks or [])
        retrieved = _sanitize_blocks(retrieved_blocks or [])
        segments: List[str] = []
        if stable:
            segments.append("Stable Memory Summary\n" + "\n\n".join(stable))
        if retrieved:
            segments.append("Retrieved Relevant Memory\n" + "\n\n".join(retrieved))
        if not segments:
            return ""
        return (
            "Workspace context files. Use these as durable background instructions and facts when they are relevant.\n\n"
            + "\n\n".join(segments)
        ).strip()

    blocks = _sanitize_blocks(contextual_blocks)
    if not blocks:
        return ""
    return (
        "Workspace context files. Use these as durable background instructions and facts when they are relevant.\n\n"
        + "\n\n".join(blocks)
    ).strip()


def build_workspace_memory_context_message(
    *,
    system_prefix: str,
    contextual_blocks: List[str],
) -> Optional[Dict[str, str]]:
    context_text = render_workspace_context_text(contextual_blocks)
    if not context_text:
        return None
    return {
        "role": "system",
        "content": f"{system_prefix}{context_text}",
    }
