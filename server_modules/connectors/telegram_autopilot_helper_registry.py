from __future__ import annotations

from typing import Any, Callable, Dict

from server_modules.connectors.telegram_camera_setup_service import TelegramCameraSetupService
from server_modules.connectors.telegram_media_service import TelegramMediaService
from server_modules.connectors.telegram_profile_service import TelegramProfileService
from server_modules.connectors.telegram_routing_service import TelegramRoutingService


class TelegramAutopilotHelperRegistry:
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

        self._profile_service: TelegramProfileService | None = None
        self._camera_setup_service: TelegramCameraSetupService | None = None
        self._media_service: TelegramMediaService | None = None
        self._routing_service: TelegramRoutingService | None = None

    def profile_service(self) -> TelegramProfileService:
        if self._profile_service is None:
            self._profile_service = TelegramProfileService(
                profile_state_file=self.profile_state_file,
                onboarding_state_file=self.onboarding_state_file,
                default_chat_prefix=self.default_chat_prefix,
                read_json=self.read_json,
                write_json=self.write_json,
                now_iso=self.now_iso,
                truncate_one_line=self.truncate_one_line,
            )
        return self._profile_service

    def camera_setup_service(self) -> TelegramCameraSetupService:
        if self._camera_setup_service is None:
            self._camera_setup_service = TelegramCameraSetupService(
                state_file=self.camera_setup_state_file,
                read_json=self.read_json,
                write_json=self.write_json,
                now_iso=self.now_iso,
                session_key_builder=self.session_key_builder,
            )
        return self._camera_setup_service

    def media_service(self) -> TelegramMediaService:
        if self._media_service is None:
            self._media_service = TelegramMediaService(
                media_dir=self.media_dir,
                media_enabled=self.media_enabled,
                media_max_items=self.media_max_items,
                media_max_bytes=self.media_max_bytes,
                media_include_in_goal=self.media_include_in_goal,
                telegram_api_request=self.telegram_api_request,
            )
        return self._media_service

    def routing_service(self) -> TelegramRoutingService:
        if self._routing_service is None:
            self._routing_service = TelegramRoutingService(
                default_chat_prefix=self.default_chat_prefix,
                quick_goal_templates=self.quick_goal_templates,
                menu_goal_templates=self.menu_goal_templates,
                normalize_profile_field=self.normalize_profile_field,
                select_skill_from_text=self.select_skill_from_text,
                skill_goal_builder=self.skill_goal_builder,
            )
        return self._routing_service
