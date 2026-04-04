from __future__ import annotations

from typing import Any, Callable, Dict, Optional


class AutopilotEndpointService:
    def _profile_payload(self, profile_id: str, info: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": profile_id,
            "label": info.get("label", profile_id),
            "description": info.get("description", ""),
            "allow_free_text": bool(info.get("allow_free_text")),
            "allow_status": bool(info.get("allow_status")),
            "allow_help": bool(info.get("allow_help")),
        }

    def autopilot_profiles_payload(
        self,
        *,
        telegram_enabled: bool,
        telegram_default_profile: str,
        telegram_catalog: Dict[str, Dict[str, Any]],
        whatsapp_enabled: bool,
        whatsapp_default_profile: str,
        whatsapp_catalog: Dict[str, Dict[str, Any]],
        whatsapp_webhook_path: str,
    ) -> Dict[str, Any]:
        return {
            "channels": {
                "telegram": {
                    "enabled": bool(telegram_enabled),
                    "default_profile": telegram_default_profile,
                    "profiles": [
                        self._profile_payload(profile_id, info if isinstance(info, dict) else {})
                        for profile_id, info in telegram_catalog.items()
                    ],
                },
                "whatsapp": {
                    "enabled": bool(whatsapp_enabled),
                    "default_profile": whatsapp_default_profile,
                    "profiles": [
                        self._profile_payload(profile_id, info if isinstance(info, dict) else {})
                        for profile_id, info in whatsapp_catalog.items()
                    ],
                    "webhook_path": whatsapp_webhook_path,
                },
            }
        }

    def whatsapp_webhook_result(
        self,
        *,
        enabled: bool,
        configured_secret: str,
        provided_secret: str,
        form: Dict[str, str],
        handle_inbound: Callable[[Dict[str, str]], str],
    ) -> Dict[str, Any]:
        if not enabled:
            return {"status_code": 200, "text": "Empyralis WhatsApp autopilot is disabled."}
        expected_secret = str(configured_secret or "").strip()
        if expected_secret and str(provided_secret or "").strip() != expected_secret:
            return {"status_code": 403, "content": "forbidden"}
        response_text = handle_inbound(form)
        return {"status_code": 200, "text": response_text}
