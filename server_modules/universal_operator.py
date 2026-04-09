from __future__ import annotations

import re
from typing import Any

from server_modules.agent_manifest import AgentManifest, manifest_has_skill
from server_modules import skill_registry


def build_system_prompt(manifest: AgentManifest) -> str:
    bound_skills = [skill.label for skill in skill_registry.list_skill_definitions() if manifest_has_skill(manifest, skill.id)]
    lines = [
        f"You are {manifest.identity.name}.",
        "",
        "Mission",
        manifest.bible.mission,
        "",
        "Hard Context",
        manifest.bible.hard_context,
        "",
        "Operational Policy",
        manifest.bible.operational_policy,
        "",
        "Bound Skills",
    ]
    lines.extend([f"- {label}" for label in bound_skills] if bound_skills else ["- No skills are currently bound."])
    return "\n".join(lines)


def _policy_text(manifest: AgentManifest) -> str:
    return " ".join([
        manifest.bible.hard_context,
        manifest.bible.operational_policy,
        manifest.bible.guardrails,
        manifest.bible.escalation_triggers,
    ]).lower()


def _direct_reply(manifest: AgentManifest, goal: str) -> str:
    normalized = str(goal or "").strip()
    if not normalized:
        return f"{manifest.identity.name} is ready."
    if re.search(r"\b(refund|discount|legal|privacy)\b", normalized, re.IGNORECASE):
        return "This request should stay in Owner Mode so the final decision follows the agent policy and approval boundary."
    if re.search(r"\b(order|book|schedule|charge)\b", normalized, re.IGNORECASE):
        return "Before I take that action, I need one clarifying detail so I stay within the owner policy."
    return (
        f"{manifest.identity.name} is operating from its owner-authored Bible. "
        "I can answer directly when the request stays inside that context, or use a bound skill when live business facts are required."
    )


def _requires_inventory_live_fact(goal: str) -> bool:
    return skill_registry.detect_skill_need(goal or "") is not None and skill_registry.detect_skill_need(goal or "").id == "inventory-tool"


def run_policy_critic(
    *,
    manifest: AgentManifest,
    goal: str,
    draft_reply: str,
    skill_id: str | None,
    skill_result: dict[str, Any] | None,
) -> dict[str, Any]:
    violations: list[str] = []
    lower_goal = str(goal or "").lower()
    lower_reply = str(draft_reply or "").lower()
    policy_text = _policy_text(manifest)

    if (
        _requires_inventory_live_fact(lower_goal)
        and re.search(r"\bin stock\b|\bavailable\b|\$\d", lower_reply)
    ):
        items = skill_result.get("items") if isinstance(skill_result, dict) else None
        if not isinstance(items, list) or len(items) == 0:
            violations.append("inventory_claim_without_live_evidence")
            draft_reply = "I need to check the live inventory tool before I confirm stock or price. One moment."

    if (
        re.search(r"\b(order|book|schedule|charge)\b", lower_goal)
        and "clarif" in policy_text
        and "?" not in draft_reply
    ):
        violations.append("clarification_required")
        draft_reply = "Before I take that action, I need one clarifying detail so I stay inside the owner policy."

    if re.search(r"\b(refund|discount|legal|privacy)\b", lower_goal) and "escalat" in policy_text:
        violations.append("owner_escalation_required")
        return {
            "mode": "escalate",
            "reply": "This request should move to Owner Mode before I answer, because the manifest marks it as an escalation case.",
            "violations": violations,
        }

    if violations:
        return {
            "mode": "rewrite",
            "reply": draft_reply,
            "violations": violations,
        }

    return {
        "mode": "pass",
        "reply": draft_reply,
        "violations": [],
    }


async def execute_customer_turn(
    *,
    manifest: AgentManifest,
    tenant_id: str,
    workspace_id: str,
    goal: str,
    seed_demo_if_empty: bool = False,
) -> dict[str, Any]:
    system_prompt = build_system_prompt(manifest)
    steps: list[dict[str, Any]] = [
        {"label": "Loading agent manifest", "detail": manifest.manifest_id, "status": "done", "kind": "thinking"},
        {"label": "Assembling Bible context", "detail": manifest.bible.hard_context or "No hard context configured", "status": "done", "kind": "thinking"},
        {"label": "Loading skill manifest", "detail": ", ".join(skill.id for skill in manifest.skills if skill.enabled) or "No bound skills", "status": "done", "kind": "thinking"},
    ]

    needed_skill = skill_registry.detect_skill_need(goal)
    skill_result: dict[str, Any] | None = None

    if needed_skill and not manifest_has_skill(manifest, needed_skill.id):
        draft_reply = (
            f"{manifest.identity.name} recognizes that this request needs {needed_skill.label}, "
            "but the owner has not bound that skill to this manifest yet."
        )
        steps.append({
            "label": "Skill gate hit",
            "detail": f"{needed_skill.label} is required but not bound",
            "status": "error",
            "kind": "connector",
        })
    elif needed_skill:
        skill_result = await skill_registry.execute_skill(
            skill_id=needed_skill.id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            goal=goal,
            agent_label=manifest.identity.name,
            hard_context=manifest.bible.hard_context,
            operational_policy=manifest.bible.operational_policy,
            seed_demo_if_empty=seed_demo_if_empty,
        )
        draft_reply = str(skill_result.get("reply") or "").strip() or _direct_reply(manifest, goal)
        steps.extend(list(skill_result.get("steps") or []))
    else:
        draft_reply = _direct_reply(manifest, goal)
        steps.append({
            "label": "No skill required",
            "detail": "Reply stays inside the manifest context without a live tool call.",
            "status": "done",
            "kind": "thinking",
        })

    critic = run_policy_critic(
        manifest=manifest,
        goal=goal,
        draft_reply=draft_reply,
        skill_id=needed_skill.id if needed_skill else None,
        skill_result=skill_result,
    )
    steps.append({
        "label": "Reflection shield",
        "detail": "No violations detected" if not critic["violations"] else ", ".join(critic["violations"]),
        "status": "done" if critic["mode"] == "pass" else "error" if critic["mode"] == "escalate" else "done",
        "kind": "thinking",
    })

    return {
        "status": str(skill_result.get("status") if isinstance(skill_result, dict) and skill_result.get("status") else critic["mode"]),
        "reply": critic["reply"],
        "artifact": skill_result.get("artifact") if isinstance(skill_result, dict) else None,
        "steps": steps,
        "system_prompt": system_prompt,
        "needed_skill_id": needed_skill.id if needed_skill else None,
        "critic": critic,
    }
