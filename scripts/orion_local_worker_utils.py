import re
from typing import Any, Dict


def split_items(raw: str) -> list[str]:
    if not raw:
        return []
    parts = []
    for chunk in raw.replace("\n", ",").split(","):
        value = chunk.strip()
        if value:
            parts.append(value)
    return parts


def skill_prompt_append_from_metadata(metadata: Dict[str, Any]) -> str:
    direct = str(metadata.get("skill_prompt_append") or "").strip()
    if direct:
        return direct[:6000]
    bundle = metadata.get("skill_bundle") if isinstance(metadata.get("skill_bundle"), dict) else {}
    skills = bundle.get("skills") if isinstance(bundle, dict) and isinstance(bundle.get("skills"), list) else []
    if not skills:
        return ""
    lines = ["Active skill directives (follow unless user overrides explicitly):"]
    for raw in skills:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()
        intent = str(raw.get("intent") or "").strip()
        guardrail = str(raw.get("guardrail") or "").strip()
        tools_raw = raw.get("tools") if isinstance(raw.get("tools"), list) else []
        tools = ", ".join(str(item).strip() for item in tools_raw if str(item).strip()) or "none"
        if title and intent:
            lines.append(f"- {title}: {intent} Guardrail: {guardrail or 'none'}. Tools: {tools}.")
    text = "\n".join(lines).strip()
    return text[:6000]


def agent_role_prompt_append_from_metadata(metadata: Dict[str, Any]) -> str:
    role = str(metadata.get("agent_role") or "").strip().lower()
    if role == "private-assistant":
        return (
            "You are acting as Private Assistant. Be concise and practical. "
            "When the user asks about files or folders, default to a user-facing summary: "
            "show main folders, important files, and hide internal/runtime files unless the user explicitly asks for hidden or raw output."
        )
    if role == "builder":
        return (
            "You are acting as Builder Ops. Prefer precise technical summaries. "
            "For file listings, group results by useful project areas before dumping raw paths."
        )
    return ""


def collapse_duplicate_reply_sections(text: str) -> str:
    cleaned = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not cleaned:
        return ""
    current_folder_marker = "Current folder:"
    first = cleaned.find(current_folder_marker)
    if first != -1:
        second = cleaned.find(current_folder_marker, first + len(current_folder_marker))
        if second != -1:
            return cleaned[:second].rstrip()
    paragraphs = [chunk.strip() for chunk in re.split(r"\n{2,}", cleaned) if chunk.strip()]
    if len(paragraphs) >= 2:
        halfway = len(paragraphs) // 2
        first_half = "\n\n".join(paragraphs[:halfway]).strip().lower()
        second_half = "\n\n".join(paragraphs[halfway:]).strip().lower()
        if first_half and first_half == second_half:
            return "\n\n".join(paragraphs[:halfway]).strip()
    return cleaned
