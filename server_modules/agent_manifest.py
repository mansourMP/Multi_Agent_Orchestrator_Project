from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AgentManifestArchetype = Literal["support_specialist", "task_automator", "intelligence_researcher", "master_os"]
AgentManifestScope = Literal["global_master", "specialist"]
AgentManifestApprovalMode = Literal["system", "guarded", "strict"]


class AgentManifestSkillBinding(BaseModel):
    id: str
    enabled: bool = True


class AgentManifestChannels(BaseModel):
    web_chat: bool = True
    email: bool = False
    phone: bool = False
    whatsapp: bool = False
    telegram: bool = False


class AgentManifestBible(BaseModel):
    mission: str = ""
    hard_context: str = ""
    operational_policy: str = ""
    core_responsibilities: str = ""
    guardrails: str = ""
    escalation_triggers: str = ""


class AgentManifestIdentity(BaseModel):
    name: str
    role: str
    archetype: AgentManifestArchetype = "support_specialist"
    summary: str = ""
    owner_mode_enabled: bool = True
    customer_mode_enabled: bool = True


class AgentManifestPolicy(BaseModel):
    reflection_enabled: bool = True
    approval_mode: AgentManifestApprovalMode = "guarded"


class AgentManifestBlueprint(BaseModel):
    source: Literal["system", "forge", "imported_blueprint"] = "forge"
    id: str | None = None
    title: str | None = None


class AgentManifest(BaseModel):
    version: Literal["empyralis.agent-manifest.v1"] = "empyralis.agent-manifest.v1"
    manifest_id: str
    engine: Literal["universal_operator"] = "universal_operator"
    scope: AgentManifestScope = "specialist"
    identity: AgentManifestIdentity
    bible: AgentManifestBible = Field(default_factory=AgentManifestBible)
    skills: list[AgentManifestSkillBinding] = Field(default_factory=list)
    channels: AgentManifestChannels = Field(default_factory=AgentManifestChannels)
    policy: AgentManifestPolicy = Field(default_factory=AgentManifestPolicy)
    blueprint: AgentManifestBlueprint = Field(default_factory=AgentManifestBlueprint)


def manifest_has_skill(manifest: AgentManifest, skill_id: str) -> bool:
    normalized = str(skill_id or "").strip()
    return any(binding.enabled and binding.id == normalized for binding in manifest.skills)


def manifest_skill_ids(manifest: AgentManifest) -> list[str]:
    return [binding.id for binding in manifest.skills if binding.enabled]


SAGE_GLOBAL_MANIFEST = AgentManifest(
    manifest_id="sage-global-manifest",
    scope="global_master",
    identity=AgentManifestIdentity(
        name="Sage",
        role="Master Operating System",
        archetype="master_os",
        summary="Global orchestrator with cross-system context and broad skill access.",
        owner_mode_enabled=False,
        customer_mode_enabled=False,
    ),
    bible=AgentManifestBible(
        mission="Operate as the master relationship for planning, delegation, approvals, execution, and system-wide awareness.",
        hard_context="Sage has cross-system context and is the only visible omniscient operator surface.",
        operational_policy="Route work to specialists when needed, keep the owner in control, and surface approvals clearly.",
        core_responsibilities="Coordinate agents, supervise runs, summarize the system, and keep work legible.",
        guardrails="Do not bypass approvals for sensitive actions. Do not expose specialist internals unless required.",
        escalation_triggers="policy conflicts\nuncertain destructive actions\ncross-tenant boundary concerns",
    ),
    skills=[
        AgentManifestSkillBinding(id="email-access"),
        AgentManifestSkillBinding(id="web-search"),
        AgentManifestSkillBinding(id="calendar-access"),
        AgentManifestSkillBinding(id="task-runner"),
        AgentManifestSkillBinding(id="inventory-tool"),
        AgentManifestSkillBinding(id="crm-notes"),
    ],
    blueprint=AgentManifestBlueprint(source="system", title="Sage Master OS"),
    policy=AgentManifestPolicy(reflection_enabled=True, approval_mode="system"),
)
