from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules.conversation_memory_policy import MemoryPolicyProfile
from server_modules.workspace_context import read_workspace_context_files


def load_workspace_context_payload(
    *,
    workspace_id: str,
    memory_query: str = "",
    agent_install_id: str | None = None,
    policy_profile: MemoryPolicyProfile,
) -> Dict[str, Any]:
    from server_modules import memory_service

    sections: List[str] = []
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
            sections.append(f"{filename}\n{content}")

    recent_logs = memory_service.get_recent_logs(
        workspace_id,
        days=policy_profile.max_recent_log_days,
        agent_install_id=agent_install_id,
    )
    if recent_logs:
        sections.append(f"Recent Daily Logs\n{recent_logs[:6000].rstrip()}")

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
    else:
        memory_facts = memory_service.get_memory(workspace_id, agent_install_id=agent_install_id)
    if memory_facts:
        sections.append(f"Runtime Memory Facts\n{memory_facts}")

    if not agent_install_id:
        try:
            from server_modules import sage_memory_service

            memory_block = sage_memory_service.build_sage_memory_context_block(
                workspace_id=workspace_id,
            )
        except Exception:
            memory_block = ""
        if memory_block:
            sections.append(memory_block)
        try:
            from server_modules import sage_services_service

            services_memory_block = sage_services_service.build_sage_services_memory_block(
                workspace_id=workspace_id,
            )
        except Exception:
            services_memory_block = ""
        if services_memory_block:
            sections.append(services_memory_block)

    return {
        "contextual_blocks": sections,
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
        },
    }


def render_workspace_context_text(contextual_blocks: List[str]) -> str:
    blocks = [str(block or "").strip() for block in contextual_blocks if str(block or "").strip()]
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
