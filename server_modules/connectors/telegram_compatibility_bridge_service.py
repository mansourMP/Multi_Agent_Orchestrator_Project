from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


class TelegramCompatibilityBridgeService:
    def __init__(
        self,
        *,
        safe_path_token: Callable[[Any], str],
        build_goal_with_profile: Callable[[str, Dict[str, str]], str],
        workspace_connector_context: Callable[[str, str, str], Dict[str, Any]],
        extract_message: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
        build_goal_with_attachments: Callable[[str, List[Dict[str, Any]]], str],
        route_message: Callable[[str, Dict[str, Any]], Dict[str, Any]],
    ) -> None:
        self.safe_path_token = safe_path_token
        self.build_goal_with_profile = build_goal_with_profile
        self.workspace_connector_context = workspace_connector_context
        self.extract_message = extract_message
        self.build_goal_with_attachments = build_goal_with_attachments
        self.route_message = route_message
