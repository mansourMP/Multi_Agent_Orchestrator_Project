import tempfile
import unittest
from pathlib import Path

from server_modules.connectors.telegram_autopilot_helper_registry import TelegramAutopilotHelperRegistry


class TelegramAutopilotHelperRegistryTests(unittest.TestCase):
    def _make_registry(self) -> TelegramAutopilotHelperRegistry:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        root = Path(tmpdir.name)
        return TelegramAutopilotHelperRegistry(
            profile_state_file=root / "profiles.json",
            onboarding_state_file=root / "onboarding.json",
            camera_setup_state_file=root / "camera.json",
            media_dir=root / "media",
            media_enabled=True,
            media_max_items=4,
            media_max_bytes=1024,
            media_include_in_goal=True,
            default_chat_prefix="/empyralis",
            quick_goal_templates={"project update": "x"},
            menu_goal_templates={"project update": "x"},
            read_json=lambda path, default: default,
            write_json=lambda path, payload: None,
            now_iso=lambda: "2026-04-05T00:00:00Z",
            truncate_one_line=lambda text, limit: text[:limit],
            session_key_builder=lambda workspace_id, chat_id: f"{workspace_id}:{chat_id}",
            telegram_api_request=lambda bot_token, method, **kwargs: {"result": []},
            normalize_profile_field=lambda raw_value: str(raw_value or ""),
            select_skill_from_text=lambda raw_text: None,
            skill_goal_builder=lambda skill: "",
        )

    def test_registry_caches_services(self) -> None:
        registry = self._make_registry()
        self.assertIs(registry.profile_service(), registry.profile_service())
        self.assertIs(registry.camera_setup_service(), registry.camera_setup_service())
        self.assertIs(registry.media_service(), registry.media_service())
        self.assertIs(registry.routing_service(), registry.routing_service())


if __name__ == "__main__":
    unittest.main()
