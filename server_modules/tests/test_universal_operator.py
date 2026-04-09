import unittest
from unittest.mock import AsyncMock, patch

from server_modules.agent_manifest import (
    AgentManifest,
    AgentManifestIdentity,
    AgentManifestSkillBinding,
)
from server_modules import universal_operator


def _parts_pro_manifest(*, skills: list[str] | None = None) -> AgentManifest:
    return AgentManifest(
        manifest_id="manifest-parts-pro",
        identity=AgentManifestIdentity(
            name="Parts Pro",
            role="Inventory Specialist",
            archetype="support_specialist",
            summary="Help customers find available parts.",
        ),
        skills=[AgentManifestSkillBinding(id=skill_id, enabled=True) for skill_id in (skills or ["inventory-tool"])],
    )


class UniversalOperatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_customer_turn_uses_skill_registry_when_skill_is_bound(self):
        manifest = _parts_pro_manifest()
        with patch(
            "server_modules.universal_operator.skill_registry.execute_skill",
            new=AsyncMock(return_value={
                "status": "ok",
                "reply": "I found 3 Tesla Model 3 Aero Wiper Kit in stock. Price: $24.99.",
                "artifact": {"label": "Inventory tool result"},
                "steps": [{"label": "Querying workspace inventory", "detail": "1 live match", "status": "done", "kind": "connector"}],
                "items": [{"sku": "TES-WIPER-M3-2022"}],
            }),
        ):
            result = await universal_operator.execute_customer_turn(
                manifest=manifest,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                goal="Do you have 2022 Tesla Model 3 wipers?",
                seed_demo_if_empty=True,
            )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["needed_skill_id"], "inventory-tool")
        self.assertEqual(result["critic"]["mode"], "pass")
        self.assertEqual(result["artifact"]["label"], "Inventory tool result")

    async def test_execute_customer_turn_escalates_when_required_skill_is_not_bound(self):
        manifest = _parts_pro_manifest(skills=["email-access"])
        result = await universal_operator.execute_customer_turn(
            manifest=manifest,
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            goal="Do you have 2022 Tesla Model 3 wipers?",
        )

        self.assertIn("has not bound", result["reply"])
        self.assertEqual(result["needed_skill_id"], "inventory-tool")

    def test_policy_critic_rewrites_inventory_claim_without_evidence(self):
        manifest = _parts_pro_manifest()
        critic = universal_operator.run_policy_critic(
            manifest=manifest,
            goal="Do you have 2022 Tesla Model 3 wipers?",
            draft_reply="Yes, it is in stock for $24.99.",
            skill_id="inventory-tool",
            skill_result={"status": "no_match", "items": []},
        )

        self.assertEqual(critic["mode"], "rewrite")
        self.assertIn("check the live inventory tool", critic["reply"])


if __name__ == "__main__":
    unittest.main()
