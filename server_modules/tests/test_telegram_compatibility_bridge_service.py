import unittest

from server_modules.connectors.telegram_compatibility_bridge_service import TelegramCompatibilityBridgeService


class TelegramCompatibilityBridgeServiceTests(unittest.TestCase):
    def test_bridge_delegates_all_helpers(self) -> None:
        service = TelegramCompatibilityBridgeService(
            safe_path_token=lambda value: f"safe:{value}",
            build_goal_with_profile=lambda goal, profile: f"{goal}|{profile.get('project', '')}",
            workspace_connector_context=lambda goal, workspace_id, current_connector_id: {
                "goal": goal,
                "workspace_id": workspace_id,
                "connector_id": current_connector_id,
            },
            extract_message=lambda update: update.get("message"),
            build_goal_with_attachments=lambda goal, attachments: f"{goal}|{len(attachments)}",
            route_message=lambda raw_text, profile: {"action": "run", "goal": raw_text, "profile": profile.get("id")},
        )

        self.assertEqual(service.safe_path_token("abc"), "safe:abc")
        self.assertEqual(service.build_goal_with_profile("goal", {"project": "demo"}), "goal|demo")
        self.assertEqual(
            service.workspace_connector_context("goal", "default", "conn-1")["connector_id"],
            "conn-1",
        )
        self.assertEqual(service.extract_message({"message": {"text": "hi"}}), {"text": "hi"})
        self.assertEqual(service.build_goal_with_attachments("goal", [{"id": "a"}]), "goal|1")
        self.assertEqual(service.route_message("hello", {"id": "assistant"})["action"], "run")


if __name__ == "__main__":
    unittest.main()
