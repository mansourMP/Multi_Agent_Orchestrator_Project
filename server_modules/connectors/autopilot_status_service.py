from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


class AutopilotStatusService:
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

    def telegram_status_payload(self) -> Dict[str, Any]:
        snapshot = self.telegram_snapshot()
        items: List[Dict[str, Any]] = []
        vault_error: Optional[str] = None
        connectors_index = snapshot.get("connectors", {}) if isinstance(snapshot.get("connectors"), dict) else {}
        try:
            entries = self.telegram_list_entries()
        except Exception as exc:
            entries = []
            vault_error = str(exc)
        for entry in entries:
            credential_id = str(entry.get("id") or "").strip()
            state = connectors_index.get(credential_id) if isinstance(connectors_index.get(credential_id), dict) else {}
            profile = self.resolve_telegram_profile(entry)
            items.append(
                {
                    "id": credential_id,
                    "label": entry.get("label"),
                    "workspace_id": self.normalize_workspace_id(entry.get("workspace_id")),
                    "profile_id": profile.get("id"),
                    "require_prefix": profile.get("require_prefix"),
                    "prefix": profile.get("prefix"),
                    "last_update_id": int(state.get("last_update_id") or 0),
                    "last_poll_at": state.get("last_poll_at"),
                    "last_processed_at": state.get("last_processed_at"),
                    "last_run_id": state.get("last_run_id"),
                    "last_action": state.get("last_action"),
                    "last_chat_id": state.get("last_chat_id"),
                    "allow_from": state.get("allow_from") if isinstance(state.get("allow_from"), list) else [],
                    "dropped_sender_count": int(state.get("dropped_sender_count") or 0),
                    "last_dropped_sender_id": state.get("last_dropped_sender_id"),
                    "last_dropped_sender_username": state.get("last_dropped_sender_username"),
                    "last_dropped_at": state.get("last_dropped_at"),
                    "last_error": state.get("last_error"),
                    "last_error_category": state.get("last_error_category"),
                    "last_error_at": state.get("last_error_at"),
                }
            )
        return {
            "ok": bool(snapshot.get("enabled")),
            "autopilot": {
                "enabled": snapshot.get("enabled"),
                "active": snapshot.get("active"),
                "thread_alive": snapshot.get("thread_alive"),
                "started_at": snapshot.get("started_at"),
                "last_poll_at": snapshot.get("last_poll_at"),
                "last_error": snapshot.get("last_error"),
                "last_error_at": snapshot.get("last_error_at"),
                "last_error_category": snapshot.get("last_error_category"),
                "last_error_source": snapshot.get("last_error_source"),
                "error_count": snapshot.get("error_count"),
                "consecutive_errors": snapshot.get("consecutive_errors"),
                "retry_count": snapshot.get("retry_count"),
                "last_retry_at": snapshot.get("last_retry_at"),
                "backoff_seconds": snapshot.get("backoff_seconds"),
                "next_retry_at": snapshot.get("next_retry_at"),
                "last_success_at": snapshot.get("last_success_at"),
                "processed_updates": snapshot.get("processed_updates"),
                "runs_started": snapshot.get("runs_started"),
                "connectors_seen": snapshot.get("connectors_seen"),
                "connector_state_count": snapshot.get("connector_state_count"),
                "connector_error_count": snapshot.get("connector_error_count"),
                "dropped_sender_count": snapshot.get("dropped_sender_count"),
                "state_file": snapshot.get("state_file"),
                "poll_seconds": snapshot.get("poll_seconds"),
                "prefix": snapshot.get("prefix"),
                "require_prefix": snapshot.get("require_prefix"),
                "default_profile": snapshot.get("default_profile"),
            },
            "connectors": items,
            "vault_error": vault_error,
        }

    def whatsapp_status_payload(self) -> Dict[str, Any]:
        snapshot = self.whatsapp_snapshot()
        items: List[Dict[str, Any]] = []
        vault_error: Optional[str] = None
        connectors_index = snapshot.get("connectors", {}) if isinstance(snapshot.get("connectors"), dict) else {}
        try:
            entries = self.whatsapp_list_entries()
        except Exception as exc:
            entries = []
            vault_error = str(exc)
        for entry in entries:
            credential_id = str(entry.get("id") or "").strip()
            state = connectors_index.get(credential_id) if isinstance(connectors_index.get(credential_id), dict) else {}
            profile = self.resolve_whatsapp_profile(entry)
            items.append(
                {
                    "id": credential_id,
                    "label": entry.get("label"),
                    "workspace_id": self.normalize_workspace_id(entry.get("workspace_id")),
                    "profile_id": profile.get("id"),
                    "require_prefix": profile.get("require_prefix"),
                    "prefix": profile.get("prefix"),
                    "last_processed_at": state.get("last_processed_at"),
                    "last_run_id": state.get("last_run_id"),
                    "last_action": state.get("last_action"),
                    "last_message_sid": state.get("last_message_sid"),
                    "last_from_number": state.get("last_from_number"),
                    "last_to_number": state.get("last_to_number"),
                    "last_error": state.get("last_error"),
                    "last_error_category": state.get("last_error_category"),
                    "last_error_at": state.get("last_error_at"),
                }
            )
        return {
            "ok": bool(snapshot.get("enabled")),
            "autopilot": {
                "enabled": snapshot.get("enabled"),
                "active": snapshot.get("active"),
                "thread_alive": snapshot.get("thread_alive"),
                "started_at": snapshot.get("started_at"),
                "last_inbound_at": snapshot.get("last_inbound_at"),
                "last_error": snapshot.get("last_error"),
                "last_error_at": snapshot.get("last_error_at"),
                "last_error_category": snapshot.get("last_error_category"),
                "last_error_source": snapshot.get("last_error_source"),
                "error_count": snapshot.get("error_count"),
                "consecutive_errors": snapshot.get("consecutive_errors"),
                "processed_messages": snapshot.get("processed_messages"),
                "runs_started": snapshot.get("runs_started"),
                "connectors_seen": snapshot.get("connectors_seen"),
                "connector_state_count": snapshot.get("connector_state_count"),
                "connector_error_count": snapshot.get("connector_error_count"),
                "state_file": snapshot.get("state_file"),
                "prefix": snapshot.get("prefix"),
                "require_prefix": snapshot.get("require_prefix"),
                "default_profile": snapshot.get("default_profile"),
            },
            "connectors": items,
            "vault_error": vault_error,
        }
