from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


class TelegramAutopilotStateService:
    def __init__(
        self,
        *,
        state: Dict[str, Any],
        lock: Any,
        read_json: Callable[[Any, Any], Dict[str, Any]],
        write_json: Callable[[Any, Dict[str, Any]], Any],
        state_file: Any,
        utc_now_iso: Callable[[], str],
        normalize_workspace_id: Callable[[Any], str],
        load_vault: Callable[[], Dict[str, Any]],
        workspace_visible: Callable[[Any, Optional[str]], bool],
        connector_paused: Callable[[Dict[str, Any]], bool],
        resolve_secret: Callable[[Dict[str, Any]], Dict[str, Any]],
        enabled: bool,
        default_profile: str,
        require_prefix: bool,
        prefix: str,
        delivery_mode: str,
        poll_seconds: float,
        max_updates: int,
        run_timeout_seconds: int,
        max_reply_chars: int,
        thread_alive: Callable[[], bool],
    ) -> None:
        self.state = state
        self.lock = lock
        self.read_json = read_json
        self.write_json = write_json
        self.state_file = state_file
        self.utc_now_iso = utc_now_iso
        self.normalize_workspace_id = normalize_workspace_id
        self.load_vault = load_vault
        self.workspace_visible = workspace_visible
        self.connector_paused = connector_paused
        self.resolve_secret = resolve_secret
        self.enabled = bool(enabled)
        self.default_profile = str(default_profile or "")
        self.require_prefix = bool(require_prefix)
        self.prefix = str(prefix or "")
        self.delivery_mode = str(delivery_mode or "").strip().lower() or "polling"
        self.poll_seconds = float(poll_seconds or 0.0)
        self.max_updates = int(max_updates or 0)
        self.run_timeout_seconds = int(run_timeout_seconds or 0)
        self.max_reply_chars = int(max_reply_chars or 0)
        self.thread_alive = thread_alive

    def load_state(self) -> None:
        payload = self.read_json(
            self.state_file,
            {
                "version": 1,
                "state": {
                    "connectors": {},
                    "processed_updates": 0,
                    "runs_started": 0,
                    "last_poll_at": None,
                    "last_error": None,
                    "last_error_at": None,
                    "last_error_category": None,
                    "last_error_source": None,
                    "error_count": 0,
                    "consecutive_errors": 0,
                    "retry_count": 0,
                    "last_retry_at": None,
                    "backoff_seconds": 0.0,
                    "next_retry_at": None,
                    "last_success_at": None,
                },
            },
        )
        state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
        connectors = state.get("connectors") if isinstance(state.get("connectors"), dict) else {}
        reconciled_connectors = dict(connectors)
        changed = False
        for item in self.load_vault().get("credentials", []):
            if not isinstance(item, dict):
                continue
            if str(item.get("provider") or "").strip().lower() != "telegram_bot":
                continue
            connector_id = str(item.get("id") or "").strip()
            if not connector_id:
                continue
            explicit_workspace_id = str(self.normalize_workspace_id(item.get("workspace_id")) or "").strip()
            if not explicit_workspace_id or explicit_workspace_id == "default":
                continue
            current_state = reconciled_connectors.get(connector_id)
            state_patch = dict(current_state) if isinstance(current_state, dict) else {}
            current_workspace_id = str(self.normalize_workspace_id(state_patch.get("workspace_id")) or "").strip()
            if current_workspace_id != explicit_workspace_id:
                state_patch["workspace_id"] = explicit_workspace_id
                if "not scoped to an explicit workspace" in str(state_patch.get("last_error") or ""):
                    state_patch["last_error"] = None
                    state_patch["last_error_category"] = None
                    state_patch["last_error_at"] = None
                changed = True
            if not str(state_patch.get("label") or "").strip():
                state_patch["label"] = str(item.get("label") or connector_id).strip() or connector_id
                changed = True
            reconciled_connectors[connector_id] = state_patch
        if changed:
            state["connectors"] = reconciled_connectors
            payload["state"] = state
            self.write_json(self.state_file, payload)
        connectors = reconciled_connectors
        with self.lock:
            self.state["connectors"] = connectors
            self.state["processed_updates"] = int(state.get("processed_updates") or 0)
            self.state["runs_started"] = int(state.get("runs_started") or 0)
            self.state["last_poll_at"] = state.get("last_poll_at")
            self.state["last_error"] = state.get("last_error")
            self.state["last_error_at"] = state.get("last_error_at")
            self.state["last_error_category"] = state.get("last_error_category")
            self.state["last_error_source"] = state.get("last_error_source")
            self.state["error_count"] = int(state.get("error_count") or 0)
            self.state["consecutive_errors"] = int(state.get("consecutive_errors") or 0)
            self.state["retry_count"] = int(state.get("retry_count") or 0)
            self.state["last_retry_at"] = state.get("last_retry_at")
            self.state["backoff_seconds"] = float(state.get("backoff_seconds") or 0.0)
            self.state["next_retry_at"] = state.get("next_retry_at")
            self.state["last_success_at"] = state.get("last_success_at")

    def persist_state(self) -> None:
        with self.lock:
            payload = {
                "version": 1,
                "state": {
                    "connectors": self.state.get("connectors", {}),
                    "processed_updates": int(self.state.get("processed_updates") or 0),
                    "runs_started": int(self.state.get("runs_started") or 0),
                    "last_poll_at": self.state.get("last_poll_at"),
                    "last_error": self.state.get("last_error"),
                    "last_error_at": self.state.get("last_error_at"),
                    "last_error_category": self.state.get("last_error_category"),
                    "last_error_source": self.state.get("last_error_source"),
                    "error_count": int(self.state.get("error_count") or 0),
                    "consecutive_errors": int(self.state.get("consecutive_errors") or 0),
                    "retry_count": int(self.state.get("retry_count") or 0),
                    "last_retry_at": self.state.get("last_retry_at"),
                    "backoff_seconds": float(self.state.get("backoff_seconds") or 0.0),
                    "next_retry_at": self.state.get("next_retry_at"),
                    "last_success_at": self.state.get("last_success_at"),
                },
            }
        self.write_json(self.state_file, payload)

    def connector_state(self, credential_id: str) -> Dict[str, Any]:
        with self.lock:
            connectors = self.state.setdefault("connectors", {})
            raw = connectors.get(credential_id)
            if not isinstance(raw, dict):
                raw = {}
            connectors[credential_id] = raw
            return raw

    def set_connector_state(self, credential_id: str, patch: Dict[str, Any]) -> None:
        with self.lock:
            connectors = self.state.setdefault("connectors", {})
            current = connectors.get(credential_id)
            if not isinstance(current, dict):
                current = {}
            for key, value in patch.items():
                current[key] = value
            connectors[credential_id] = current
        self.persist_state()

    def list_connector_entries(self, requested_workspace_id: Optional[str]) -> List[Dict[str, Any]]:
        requested_ws = self.normalize_workspace_id(requested_workspace_id)
        entries: List[Dict[str, Any]] = []
        seen_identities: set[str] = set()
        for item in self.load_vault().get("credentials", []):
            if not isinstance(item, dict):
                continue
            if str(item.get("provider") or "").strip().lower() != "telegram_bot":
                continue
            if not self.workspace_visible(item.get("workspace_id"), requested_ws):
                continue
            if self.connector_paused(item):
                continue
            try:
                secret = self.resolve_secret(item)
            except Exception:
                continue
            bot_token = str(secret.get("bot_token") or "").strip()
            chat_id = str(secret.get("chat_id") or "").strip()
            identity = f"{bot_token}:{chat_id}" if bot_token and chat_id else ""
            if identity:
                if identity in seen_identities:
                    continue
                seen_identities.add(identity)
            entries.append(item)
        entries.sort(key=lambda item: str(item.get("label") or "").lower())
        return entries

    def get_connector_entry(self, connector_id: str) -> Dict[str, Any]:
        connector_token = str(connector_id or "").strip()
        if not connector_token:
            raise LookupError("Telegram connector id is required.")
        for item in self.load_vault().get("credentials", []):
            if not isinstance(item, dict):
                continue
            if str(item.get("provider") or "").strip().lower() != "telegram_bot":
                continue
            if str(item.get("id") or "").strip() != connector_token:
                continue
            if self.connector_paused(item):
                raise LookupError(f"Telegram connector '{connector_token}' is paused.")
            try:
                self.resolve_secret(item)
            except Exception as exc:
                raise RuntimeError(f"Telegram connector '{connector_token}' is not usable: {exc}") from exc
            return item
        raise LookupError(f"Telegram connector '{connector_token}' is not configured.")

    def snapshot(self, *, include_connectors: bool = False) -> Dict[str, Any]:
        with self.lock:
            connectors_raw = self.state.get("connectors", {})
            connectors = dict(connectors_raw) if isinstance(connectors_raw, dict) else {}
            snapshot: Dict[str, Any] = {
                "enabled": self.enabled,
                "active": bool(self.state.get("active")),
                "started_at": self.state.get("started_at"),
                "last_poll_at": self.state.get("last_poll_at"),
                "last_error": self.state.get("last_error"),
                "last_error_at": self.state.get("last_error_at"),
                "last_error_category": self.state.get("last_error_category"),
                "last_error_source": self.state.get("last_error_source"),
                "error_count": int(self.state.get("error_count") or 0),
                "consecutive_errors": int(self.state.get("consecutive_errors") or 0),
                "retry_count": int(self.state.get("retry_count") or 0),
                "last_retry_at": self.state.get("last_retry_at"),
                "backoff_seconds": float(self.state.get("backoff_seconds") or 0.0),
                "next_retry_at": self.state.get("next_retry_at"),
                "last_success_at": self.state.get("last_success_at"),
                "connectors_seen": int(self.state.get("connectors_seen") or 0),
                "processed_updates": int(self.state.get("processed_updates") or 0),
                "runs_started": int(self.state.get("runs_started") or 0),
                "poll_seconds": self.poll_seconds,
                "max_updates": self.max_updates,
                "run_timeout_seconds": self.run_timeout_seconds,
                "max_reply_chars": self.max_reply_chars,
                "require_prefix": self.require_prefix,
                "prefix": self.prefix,
                "default_profile": self.default_profile,
                "delivery_mode": self.delivery_mode,
                "state_file": str(self.state_file),
                "thread_alive": bool(self.thread_alive()),
            }
        connector_error_count = 0
        dropped_sender_count = 0
        for connector_state in connectors.values():
            if isinstance(connector_state, dict):
                if connector_state.get("last_error"):
                    connector_error_count += 1
                dropped_sender_count += int(connector_state.get("dropped_sender_count") or 0)
        snapshot["connector_state_count"] = len(connectors)
        snapshot["connector_error_count"] = connector_error_count
        snapshot["dropped_sender_count"] = dropped_sender_count
        if include_connectors:
            snapshot["connectors"] = connectors
        return snapshot
