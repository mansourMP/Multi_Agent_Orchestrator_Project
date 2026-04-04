from __future__ import annotations

from typing import Any, Callable, Dict


class AutopilotProfileService:
    def __init__(
        self,
        *,
        default_chat_prefix: str,
        bool_from_any: Callable[[Any, bool], bool],
        telegram_default_profile: str,
        telegram_default_prefix: str,
        telegram_default_require_prefix: bool,
        telegram_profile_catalog: Dict[str, Dict[str, Any]],
        whatsapp_default_profile: str,
        whatsapp_default_prefix: str,
        whatsapp_default_require_prefix: bool,
        whatsapp_profile_catalog: Dict[str, Dict[str, Any]],
    ) -> None:
        self.default_chat_prefix = str(default_chat_prefix or "").strip()
        self.bool_from_any = bool_from_any
        self.telegram_default_profile = str(telegram_default_profile or "assistant").strip().lower() or "assistant"
        self.telegram_default_prefix = str(telegram_default_prefix or self.default_chat_prefix).strip() or self.default_chat_prefix
        self.telegram_default_require_prefix = bool(telegram_default_require_prefix)
        self.telegram_profile_catalog = dict(telegram_profile_catalog)
        self.whatsapp_default_profile = str(whatsapp_default_profile or "assistant").strip().lower() or "assistant"
        self.whatsapp_default_prefix = str(whatsapp_default_prefix or self.default_chat_prefix).strip() or self.default_chat_prefix
        self.whatsapp_default_require_prefix = bool(whatsapp_default_require_prefix)
        self.whatsapp_profile_catalog = dict(whatsapp_profile_catalog)

    def resolve_telegram_profile(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
        requested_profile = str(metadata.get("autopilot_profile") or self.telegram_default_profile).strip().lower()
        if requested_profile not in self.telegram_profile_catalog:
            requested_profile = "assistant"
        profile_base = self.telegram_profile_catalog.get(
            requested_profile,
            self.telegram_profile_catalog["assistant"],
        )
        prefix = str(metadata.get("autopilot_prefix") or self.telegram_default_prefix).strip() or self.telegram_default_prefix
        require_prefix = self.bool_from_any(
            metadata.get("autopilot_require_prefix"),
            self.telegram_default_require_prefix,
        )
        allow_free_text = self.bool_from_any(
            metadata.get("autopilot_allow_free_text"),
            bool(profile_base.get("allow_free_text")),
        )
        allow_status = self.bool_from_any(
            metadata.get("autopilot_allow_status"),
            bool(profile_base.get("allow_status")),
        )
        allow_help = self.bool_from_any(
            metadata.get("autopilot_allow_help"),
            bool(profile_base.get("allow_help")),
        )
        return {
            "id": requested_profile,
            "label": profile_base.get("label"),
            "description": profile_base.get("description"),
            "prefix": prefix,
            "require_prefix": require_prefix,
            "allow_free_text": allow_free_text,
            "allow_status": allow_status,
            "allow_help": allow_help,
        }

    def resolve_whatsapp_profile(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
        requested_profile = str(
            metadata.get("autopilot_profile_whatsapp")
            or metadata.get("autopilot_profile")
            or self.whatsapp_default_profile
        ).strip().lower()
        if requested_profile not in self.whatsapp_profile_catalog:
            requested_profile = "assistant"
        profile_base = self.whatsapp_profile_catalog.get(
            requested_profile,
            self.whatsapp_profile_catalog["assistant"],
        )
        prefix = str(
            metadata.get("autopilot_prefix_whatsapp")
            or metadata.get("autopilot_prefix")
            or self.whatsapp_default_prefix
        ).strip() or self.whatsapp_default_prefix
        require_prefix = self.bool_from_any(
            metadata.get("autopilot_require_prefix_whatsapp")
            if metadata.get("autopilot_require_prefix_whatsapp") is not None
            else metadata.get("autopilot_require_prefix"),
            self.whatsapp_default_require_prefix,
        )
        allow_free_text = self.bool_from_any(
            metadata.get("autopilot_allow_free_text"),
            bool(profile_base.get("allow_free_text")),
        )
        allow_status = self.bool_from_any(
            metadata.get("autopilot_allow_status"),
            bool(profile_base.get("allow_status")),
        )
        allow_help = self.bool_from_any(
            metadata.get("autopilot_allow_help"),
            bool(profile_base.get("allow_help")),
        )
        return {
            "id": requested_profile,
            "label": profile_base.get("label"),
            "description": profile_base.get("description"),
            "prefix": prefix,
            "require_prefix": require_prefix,
            "allow_free_text": allow_free_text,
            "allow_status": allow_status,
            "allow_help": allow_help,
        }

    def whatsapp_help_text(self, profile: Dict[str, Any]) -> str:
        prefix = str(profile.get("prefix") or self.default_chat_prefix).strip() or self.default_chat_prefix
        lines = [
            "Empyralis WhatsApp Commands",
            f"- {prefix} run <goal>",
        ]
        if bool(profile.get("allow_status")):
            lines.append(f"- {prefix} status")
        lines.append(f"- {prefix} approvals [limit]")
        lines.append(f"- {prefix} approve <event_id> [note]")
        lines.append(f"- {prefix} reject <event_id> [reason]")
        if bool(profile.get("allow_help")):
            lines.append(f"- {prefix} help")
        if bool(profile.get("allow_free_text")):
            lines.append("- Or send plain text to start a run.")
        else:
            lines.append("- Plain text is ignored in this profile.")
        return "\n".join(lines)
