import unittest

from server_modules.connectors.telegram_helper_registry_bridge_service import TelegramHelperRegistryBridgeService


class _FakeHelperRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)


class TelegramHelperRegistryBridgeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHelperRegistry.instances.clear()

    def test_bridge_caches_helper_registry_and_preserves_callbacks(self) -> None:
        service = TelegramHelperRegistryBridgeService(
            profile_state_file="/tmp/profiles.json",
            onboarding_state_file="/tmp/onboarding.json",
            camera_setup_state_file="/tmp/camera.json",
            media_dir="/tmp/media",
            media_enabled=True,
            media_max_items=4,
            media_max_bytes=1024,
            media_include_in_goal=True,
            default_chat_prefix="/empyralis",
            quick_goal_templates={"project update": "summary"},
            menu_goal_templates={"project update": "summary"},
            read_json=lambda path, default: {"path": path, "default": default},
            write_json=lambda path, payload: {"path": path, "payload": payload},
            now_iso=lambda: "2026-04-05T00:00:00Z",
            truncate_one_line=lambda text, limit: str(text)[:limit],
            session_key_builder=lambda workspace_id, chat_id: f"{workspace_id}:{chat_id}",
            telegram_api_request=lambda bot_token, method, **kwargs: {
                "bot_token": bot_token,
                "method": method,
                "kwargs": kwargs,
            },
            normalize_profile_field=lambda raw_value: str(raw_value).strip().lower(),
            select_skill_from_text=lambda raw_text: {"skill": raw_text},
            skill_goal_builder=lambda skill: f"goal:{skill.get('skill')}",
            helper_registry_class=_FakeHelperRegistry,
        )

        first = service.telegram_helper_registry()
        second = service.telegram_helper_registry()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeHelperRegistry.instances), 1)
        kwargs = first.kwargs
        self.assertEqual(kwargs["default_chat_prefix"], "/empyralis")
        self.assertEqual(kwargs["session_key_builder"]("default", "42"), "default:42")
        self.assertEqual(kwargs["normalize_profile_field"]("  OWNER "), "owner")
        self.assertEqual(kwargs["select_skill_from_text"]("browser"), {"skill": "browser"})
        self.assertEqual(kwargs["skill_goal_builder"]({"skill": "browser"}), "goal:browser")


if __name__ == "__main__":
    unittest.main()
