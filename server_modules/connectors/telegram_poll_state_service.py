from __future__ import annotations

from typing import Any, Callable, Dict, List


class TelegramPollStateService:
    def __init__(
        self,
        *,
        set_connector_state: Callable[[str, Dict[str, Any]], Any],
        utc_now_iso: Callable[[], str],
        increment_processed_updates: Callable[[], Any],
    ) -> None:
        self.set_connector_state = set_connector_state
        self.utc_now_iso = utc_now_iso
        self.increment_processed_updates = increment_processed_updates

    def record_processed_update(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        update_id: int,
        chat_id: str,
        action: str,
        profile_id: str,
        allow_from: List[str],
        run_id: str = "",
        approval_state_patch: Dict[str, Any] | None = None,
    ) -> None:
        state_patch: Dict[str, Any] = {
            "label": label,
            "workspace_id": workspace_id,
            "last_update_id": update_id,
            "last_processed_at": self.utc_now_iso(),
            "last_error": None,
            "last_error_category": None,
            "last_error_at": None,
            "last_chat_id": chat_id,
            "last_action": action,
            "profile_id": profile_id,
            "allow_from": list(allow_from),
        }
        if run_id:
            state_patch["last_run_id"] = run_id
        if isinstance(approval_state_patch, dict) and approval_state_patch:
            state_patch.update(approval_state_patch)
        self.set_connector_state(connector_id, state_patch)
        self.increment_processed_updates()

    def record_poll_completion(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        max_seen: int,
        profile_id: str,
        allow_from: List[str],
        approval_state_patch: Dict[str, Any] | None = None,
    ) -> None:
        patch: Dict[str, Any] = {
            "label": label,
            "workspace_id": workspace_id,
            "last_update_id": max_seen,
            "last_poll_at": self.utc_now_iso(),
            "last_error": None,
            "last_error_category": None,
            "last_error_at": None,
            "profile_id": profile_id,
            "allow_from": list(allow_from),
        }
        if isinstance(approval_state_patch, dict) and approval_state_patch:
            patch.update(approval_state_patch)
        self.set_connector_state(connector_id, patch)

    def record_poll_approval_only(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        profile_id: str,
        allow_from: List[str],
        approval_state_patch: Dict[str, Any],
    ) -> None:
        self.set_connector_state(
            connector_id,
            {
                "label": label,
                "workspace_id": workspace_id,
                "last_poll_at": self.utc_now_iso(),
                "last_error": None,
                "last_error_category": None,
                "last_error_at": None,
                "profile_id": profile_id,
                "allow_from": list(allow_from),
                **approval_state_patch,
            },
        )

    def record_connector_error(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        detail: str,
        category: str,
    ) -> None:
        self.set_connector_state(
            connector_id,
            {
                "label": label,
                "workspace_id": workspace_id,
                "last_error": detail,
                "last_error_category": category,
                "last_error_at": self.utc_now_iso(),
                "last_poll_at": self.utc_now_iso(),
            },
        )
