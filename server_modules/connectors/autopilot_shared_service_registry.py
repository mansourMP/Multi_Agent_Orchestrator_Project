from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from server_modules.connectors.autopilot_endpoint_service import AutopilotEndpointService
from server_modules.connectors.autopilot_status_service import AutopilotStatusService


class AutopilotSharedServiceRegistry:
    def __init__(
        self,
        *,
        normalize_workspace_id: Callable[[Any], str],
        telegram_snapshot: Callable[[], Dict[str, Any]],
        telegram_list_entries: Callable[[], List[Dict[str, Any]]],
        resolve_telegram_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
        whatsapp_snapshot: Callable[[], Dict[str, Any]],
        whatsapp_list_entries: Callable[[], List[Dict[str, Any]]],
        resolve_whatsapp_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> None:
        self.normalize_workspace_id = normalize_workspace_id
        self.telegram_snapshot = telegram_snapshot
        self.telegram_list_entries = telegram_list_entries
        self.resolve_telegram_profile = resolve_telegram_profile
        self.whatsapp_snapshot = whatsapp_snapshot
        self.whatsapp_list_entries = whatsapp_list_entries
        self.resolve_whatsapp_profile = resolve_whatsapp_profile

        self._status_service: Optional[AutopilotStatusService] = None
        self._endpoint_service: Optional[AutopilotEndpointService] = None

    def autopilot_status_service(self) -> AutopilotStatusService:
        if self._status_service is None:
            self._status_service = AutopilotStatusService(
                normalize_workspace_id=self.normalize_workspace_id,
                telegram_snapshot=self.telegram_snapshot,
                telegram_list_entries=self.telegram_list_entries,
                resolve_telegram_profile=self.resolve_telegram_profile,
                whatsapp_snapshot=self.whatsapp_snapshot,
                whatsapp_list_entries=self.whatsapp_list_entries,
                resolve_whatsapp_profile=self.resolve_whatsapp_profile,
            )
        return self._status_service

    def autopilot_endpoint_service(self) -> AutopilotEndpointService:
        if self._endpoint_service is None:
            self._endpoint_service = AutopilotEndpointService()
        return self._endpoint_service
