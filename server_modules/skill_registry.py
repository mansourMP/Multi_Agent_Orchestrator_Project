from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from server_modules import inventory_skill


SkillExecutor = Callable[..., Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class SkillDefinition:
    id: str
    label: str
    description: str
    permission_label: str
    execution_mode: str
    trigger_terms: tuple[str, ...]
    executor: SkillExecutor | None = None


async def _preview_web_search(*, goal: str, agent_label: str, hard_context: str, operational_policy: str, **_: Any) -> dict[str, Any]:
    return {
        "status": "preview",
        "reply": "I would run a scoped web retrieval before answering so I can ground the response in public sources.",
        "artifact": {
            "label": "Web Search preview",
            "kind": "skill-simulation",
            "summary": "Preview of the search plan the universal harness would execute.",
            "media_type": "text/markdown",
            "preview_content": "\n".join([
                "# Web Search preview",
                "",
                f"- Agent: {agent_label}",
                f"- Goal: {goal}",
                f"- Hard Context: {hard_context or 'None'}",
                f"- Operational Policy: {operational_policy or 'None'}",
                "",
                "Public web retrieval remains preview-only in this phase.",
            ]),
        },
        "steps": [
            {"label": "Resolving public research request", "detail": goal, "status": "done", "kind": "thinking"},
            {"label": "Preparing web search plan", "detail": "Preview-only execution lane", "status": "done", "kind": "connector"},
        ],
    }


async def _manual_skill_stub(*, goal: str, agent_label: str, skill_label: str, **_: Any) -> dict[str, Any]:
    return {
        "status": "manual",
        "reply": f"{agent_label} recognizes that this request needs {skill_label}, but that skill is still waiting for a live adapter.",
        "artifact": None,
        "steps": [
            {"label": "Resolving skill requirement", "detail": goal, "status": "done", "kind": "thinking"},
            {"label": "Skill adapter unavailable", "detail": f"{skill_label} is not wired to a live execution path yet", "status": "error", "kind": "connector"},
        ],
    }


SKILL_REGISTRY: tuple[SkillDefinition, ...] = (
    SkillDefinition(
        id="email-access",
        label="Email Access",
        description="Read, draft, and route customer emails.",
        permission_label="Inbox scope",
        execution_mode="manual",
        trigger_terms=("email", "inbox", "reply", "respond by email"),
    ),
    SkillDefinition(
        id="web-search",
        label="Web Search",
        description="Research public facts and retrieve references.",
        permission_label="Public web",
        execution_mode="preview",
        trigger_terms=("latest", "research", "search", "find online", "web", "source", "look up", "compare"),
        executor=_preview_web_search,
    ),
    SkillDefinition(
        id="calendar-access",
        label="Calendar Access",
        description="Create, move, or confirm appointments.",
        permission_label="Calendar scope",
        execution_mode="manual",
        trigger_terms=("appointment", "book", "schedule", "calendar", "reschedule"),
    ),
    SkillDefinition(
        id="task-runner",
        label="Task Runner",
        description="Execute operational tools behind approvals.",
        permission_label="Operational tools",
        execution_mode="manual",
        trigger_terms=("run task", "execute", "automation", "update system"),
    ),
    SkillDefinition(
        id="inventory-tool",
        label="Inventory Tool",
        description="Check stock, fitment, and availability from the workspace inventory table.",
        permission_label="Inventory scope",
        execution_mode="live",
        trigger_terms=("inventory", "stock", "availability", "fitment", "sku", "part", "parts", "wiper", "brake", "rotor", "filter", "tesla", "toyota", "model 3", "eta", "delivery"),
        executor=inventory_skill.execute_inventory_skill,
    ),
    SkillDefinition(
        id="crm-notes",
        label="CRM Notes",
        description="Write structured conversation notes back to the system of record.",
        permission_label="CRM writeback",
        execution_mode="manual",
        trigger_terms=("crm", "lead note", "follow up note", "save note"),
    ),
)


def get_skill_definition(skill_id: str) -> SkillDefinition | None:
    normalized = str(skill_id or "").strip()
    for skill in SKILL_REGISTRY:
        if skill.id == normalized:
            return skill
    return None


def list_skill_definitions() -> list[SkillDefinition]:
    return list(SKILL_REGISTRY)


def detect_skill_need(goal: str) -> SkillDefinition | None:
    normalized = str(goal or "").strip().lower()
    if not normalized:
        return None
    for skill in SKILL_REGISTRY:
        if any(term in normalized for term in skill.trigger_terms):
            return skill
    return None


async def execute_skill(
    *,
    skill_id: str,
    tenant_id: str,
    workspace_id: str,
    goal: str,
    agent_label: str,
    hard_context: str,
    operational_policy: str,
    seed_demo_if_empty: bool = False,
) -> dict[str, Any]:
    definition = get_skill_definition(skill_id)
    if definition is None:
        return {
            "status": "missing",
            "reply": f"The requested skill {skill_id} is not registered in the universal harness.",
            "artifact": None,
            "steps": [
                {"label": "Resolving skill registry", "detail": skill_id, "status": "error", "kind": "connector"},
            ],
        }

    if definition.executor is None:
        return await _manual_skill_stub(goal=goal, agent_label=agent_label, skill_label=definition.label)

    return await definition.executor(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        goal=goal,
        agent_label=agent_label,
        hard_context=hard_context,
        operational_policy=operational_policy,
        seed_demo_if_empty=seed_demo_if_empty,
    )
