from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from server_modules.connectors.telegram_autopilot_helper_registry import TelegramAutopilotHelperRegistry


class TelegramHelperRegistryBridgeService:
    def __init__(
        self,
        *,
        profile_state_file: Any,
        onboarding_state_file: Any,
        camera_setup_state_file: Any,
        media_dir: Any,
        media_enabled: bool,
        media_max_items: int,
        media_max_bytes: int,
        media_include_in_goal: bool,
        default_chat_prefix: str,
        quick_goal_templates: Dict[str, str],
        menu_goal_templates: Dict[str, str],
        read_json: Callable[[Any, Any], Any],
        write_json: Callable[[Any, Any], Any],
        now_iso: Callable[[], str],
        truncate_one_line: Callable[[str, int], str],
        session_key_builder: Callable[[str, str], str],
        telegram_api_request: Callable[..., Dict[str, Any]],
        normalize_profile_field: Callable[[Any], str],
        select_skill_from_text: Callable[[str], Any],
        skill_goal_builder: Callable[[Dict[str, Any]], str],
        helper_registry_class: Callable[..., Any] = TelegramAutopilotHelperRegistry,
    ) -> None:
        self.profile_state_file = profile_state_file
        self.onboarding_state_file = onboarding_state_file
        self.camera_setup_state_file = camera_setup_state_file
        self.media_dir = media_dir
        self.media_enabled = bool(media_enabled)
        self.media_max_items = int(media_max_items)
        self.media_max_bytes = int(media_max_bytes)
        self.media_include_in_goal = bool(media_include_in_goal)
        self.default_chat_prefix = str(default_chat_prefix or "")
        self.quick_goal_templates = dict(quick_goal_templates)
        self.menu_goal_templates = dict(menu_goal_templates)
        self.read_json = read_json
        self.write_json = write_json
        self.now_iso = now_iso
        self.truncate_one_line = truncate_one_line
        self.session_key_builder = session_key_builder
        self.telegram_api_request = telegram_api_request
        self.normalize_profile_field = normalize_profile_field
        self.select_skill_from_text = select_skill_from_text
        self.skill_goal_builder = skill_goal_builder
        self.helper_registry_class = helper_registry_class

        self._helper_registry: Optional[Any] = None

    def telegram_helper_registry(self) -> Any:
        if self._helper_registry is None:
            self._helper_registry = self.helper_registry_class(
                profile_state_file=self.profile_state_file,
                onboarding_state_file=self.onboarding_state_file,
                camera_setup_state_file=self.camera_setup_state_file,
                media_dir=self.media_dir,
                media_enabled=self.media_enabled,
                media_max_items=self.media_max_items,
                media_max_bytes=self.media_max_bytes,
                media_include_in_goal=self.media_include_in_goal,
                default_chat_prefix=self.default_chat_prefix,
                quick_goal_templates=self.quick_goal_templates,
                menu_goal_templates=self.menu_goal_templates,
                read_json=self.read_json,
                write_json=self.write_json,
                now_iso=self.now_iso,
                truncate_one_line=self.truncate_one_line,
                session_key_builder=self.session_key_builder,
                telegram_api_request=self.telegram_api_request,
                normalize_profile_field=self.normalize_profile_field,
                select_skill_from_text=self.select_skill_from_text,
                skill_goal_builder=self.skill_goal_builder,
            )
        return self._helper_registry
