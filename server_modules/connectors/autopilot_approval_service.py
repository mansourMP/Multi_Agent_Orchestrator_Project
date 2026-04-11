from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional


class AutopilotApprovalService:
    def __init__(
        self,
        *,
        default_chat_prefix: str,
        cognitive_module: Callable[[], Any],
        cognitive_defaults: Callable[[], Dict[str, str]],
        truncate_one_line: Callable[[str, int], str],
        normalize_string_list: Callable[[Any], List[str]],
        utc_now_iso: Callable[[], str],
        send_message: Callable[..., Any],
        ensure_workspace_approvals_access: Optional[Callable[[str], Any]] = None,
        runtime_approvals_list: Optional[Callable[..., Dict[str, Any]]] = None,
        runtime_approval_resolve: Optional[Callable[..., Dict[str, Any]]] = None,
    ) -> None:
        self.default_chat_prefix = str(default_chat_prefix or "").strip()
        self.cognitive_module = cognitive_module
        self.cognitive_defaults = cognitive_defaults
        self.truncate_one_line = truncate_one_line
        self.normalize_string_list = normalize_string_list
        self.utc_now_iso = utc_now_iso
        self.send_message = send_message
        self.ensure_workspace_approvals_access = ensure_workspace_approvals_access
        self.runtime_approvals_list = runtime_approvals_list
        self.runtime_approval_resolve = runtime_approval_resolve

    def _load_runtime_approvals_list(self) -> Callable[..., Dict[str, Any]]:
        if callable(self.runtime_approvals_list):
            return self.runtime_approvals_list
        from server_modules import runtime_run_approval_service

        return lambda limit, workspace_id=None: {
            "ok": True,
            **runtime_run_approval_service.list_pending_approvals_payload(
                workspace_id=workspace_id,
                limit=limit,
            ),
        }

    def _load_runtime_approval_resolve(self) -> Callable[..., Dict[str, Any]]:
        if callable(self.runtime_approval_resolve):
            return self.runtime_approval_resolve
        from server_modules import runtime_run_approval_service

        return lambda event_id, approved, note, workspace_id=None: {
            "ok": True,
            **runtime_run_approval_service.resolve_standalone_approval_with_runtime_defaults(
                str(event_id or "").strip(),
                payload={
                    "approval_id": str(event_id or "").strip(),
                    "resolution": "approved" if bool(approved) else "rejected",
                    "actor": "connector",
                    "reason": str(note or ""),
                },
            ),
        }

    def _fallback_cognitive_approvals_list(self, limit: int) -> Dict[str, Any]:
        mod = self.cognitive_module()
        if mod is None:
            return {"ok": False, "error": "cognitive_daemon_unavailable"}
        conf = self.cognitive_defaults()
        items = mod.list_pending_approvals(
            db_path=conf["db_path"],
            niche_id=conf["niche_id"],
            limit=max(1, min(20, int(limit))),
        )
        return {"ok": True, "items": items, "count": len(items)}

    def _fallback_cognitive_approval_resolve(self, event_id: str, approved: bool, note: str) -> Dict[str, Any]:
        mod = self.cognitive_module()
        if mod is None:
            return {"ok": False, "error": "cognitive_daemon_unavailable"}
        conf = self.cognitive_defaults()
        out = mod.resolve_event_approval(
            db_path=conf["db_path"],
            event_id=str(event_id or "").strip(),
            approved=bool(approved),
            note=str(note or "").strip(),
        )
        return out if isinstance(out, dict) else {"ok": False, "error": "invalid_resolve_response"}

    def _normalize_approval_item(self, item: Dict[str, Any]) -> Dict[str, Any]:
        payload = dict(item or {})
        approval_id = str(payload.get("approval_id") or payload.get("event_id") or "").strip()
        if approval_id:
            payload.setdefault("approval_id", approval_id)
            payload.setdefault("event_id", approval_id)
        payload.setdefault("summary", str(payload.get("prompt") or "Approval required.").strip())
        payload.setdefault("objective_id", str(payload.get("run_id") or "").strip())
        payload.setdefault("objective_title", str(payload.get("action") or "").strip())
        payload.setdefault("risk_level", str(payload.get("status") or "unknown").strip() or "unknown")
        return payload

    def approvals_list(self, limit: int = 5, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        if workspace_id and callable(self.ensure_workspace_approvals_access):
            try:
                self.ensure_workspace_approvals_access(str(workspace_id or "").strip())
            except Exception as exc:
                return {"ok": False, "error": getattr(exc, "detail", str(exc) or "approvals_unavailable")}
        try:
            payload = self._load_runtime_approvals_list()(limit=max(1, min(20, int(limit))), workspace_id=workspace_id)
            items = payload.get("items") if isinstance(payload.get("items"), list) else []
            normalized_items = [
                self._normalize_approval_item(item)
                for item in items
                if isinstance(item, dict)
            ]
            return {"ok": bool(payload.get("ok", True)), "items": normalized_items, "count": len(normalized_items)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        except BaseException:
            raise

    def approval_resolve(
        self,
        event_id: str,
        approved: bool,
        note: str = "",
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if workspace_id and callable(self.ensure_workspace_approvals_access):
            try:
                self.ensure_workspace_approvals_access(str(workspace_id or "").strip())
            except Exception as exc:
                return {"ok": False, "error": getattr(exc, "detail", str(exc) or "approvals_unavailable")}
        try:
            payload = self._load_runtime_approval_resolve()(
                event_id=str(event_id or "").strip(),
                approved=bool(approved),
                note=str(note or "").strip(),
                workspace_id=workspace_id,
            )
            if not isinstance(payload, dict):
                return {"ok": False, "error": "invalid_resolve_response"}
            normalized = dict(payload)
            approval_id = str(normalized.get("approval_id") or normalized.get("event_id") or event_id or "").strip()
            if approval_id:
                normalized.setdefault("approval_id", approval_id)
                normalized.setdefault("event_id", approval_id)
            normalized.setdefault("status", str(normalized.get("resolution") or ("approved" if approved else "rejected")).strip())
            normalized.setdefault("ok", True)
            return normalized
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        except BaseException:
            raise

    def pending_approval_event_id(self, item: Dict[str, Any]) -> str:
        return str(item.get("event_id") or item.get("approval_id") or "").strip()

    def approvals_text(self, payload: Dict[str, Any], prefix: str = "") -> str:
        if not bool(payload.get("ok")):
            reason = str(payload.get("error") or "unable to load approvals")
            return f"Empyralis approvals unavailable: {reason}"
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        if not items:
            return "No pending approvals."
        effective_prefix = str(prefix or self.default_chat_prefix).strip() or self.default_chat_prefix
        lines = ["Pending approvals:"]
        for item in items[:10]:
            if not isinstance(item, dict):
                continue
            event_id = self.pending_approval_event_id(item)
            short_id = event_id[:8] if event_id else "unknown"
            risk = str(item.get("risk_level") or "").strip() or "unknown"
            summary = self.truncate_one_line(str(item.get("summary") or "").strip(), 96)
            objective_title = self.truncate_one_line(str(item.get("objective_title") or "").strip(), 40)
            objective_id = str(item.get("objective_id") or "").strip()
            objective_text = ""
            if objective_title:
                objective_text = f" objective={objective_title}"
            elif objective_id:
                objective_text = f" objective={objective_id[:8]}"
            if event_id:
                lines.append(
                    f"- {short_id} risk={risk}{objective_text} {summary}\n  event_id: {event_id}".rstrip()
                )
            else:
                lines.append(f"- {short_id} risk={risk}{objective_text} {summary}".rstrip())
        lines.append(f"Use {effective_prefix} approve <event_id> or {effective_prefix} reject <event_id> <reason>")
        return "\n".join(lines)

    def approval_result_text(self, payload: Dict[str, Any], approved: bool) -> str:
        if not bool(payload.get("ok")):
            reason = str(payload.get("error") or "approval update failed")
            return f"Approval update failed: {reason}"
        event_id = str(payload.get("event_id") or payload.get("approval_id") or "").strip()
        short_id = event_id[:8] if event_id else "unknown"
        status = str(payload.get("status") or "").strip() or ("pending" if approved else "failed")
        if approved:
            return f"Approved {short_id}. Status: {status}."
        note = str(payload.get("note") or "").strip()
        suffix = f" Reason: {note}" if note else ""
        return f"Rejected {short_id}. Status: {status}.{suffix}"

    def notify_pending_approvals(
        self,
        *,
        connector_state: Dict[str, Any],
        bot_token: str,
        chat_id: str,
        workspace_id: str,
        profile: Dict[str, Any],
        connector_id: str,
    ) -> Dict[str, Any]:
        patch: Dict[str, Any] = {}
        prefix = str(profile.get("prefix") or self.default_chat_prefix)
        payload = self.approvals_list(limit=20, workspace_id=workspace_id)
        if not bool(payload.get("ok")):
            reason = str(payload.get("error") or "unable to load approvals").strip() or "unable to load approvals"
            if reason != str(connector_state.get("last_approval_notify_error") or "").strip():
                patch["last_approval_notify_error"] = reason
            return patch

        patch["last_approval_notify_error"] = None
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        pending_items = [item for item in items if isinstance(item, dict)]
        pending_ids: List[str] = []
        for item in pending_items:
            event_id = self.pending_approval_event_id(item)
            if event_id and event_id not in pending_ids:
                pending_ids.append(event_id)

        previous_ids = self.normalize_string_list(connector_state.get("notified_approval_ids"))
        pending_id_set = set(pending_ids)
        retained_ids = [event_id for event_id in previous_ids if event_id in pending_id_set]
        retained_id_set = set(retained_ids)
        new_items = [item for item in pending_items if self.pending_approval_event_id(item) not in retained_id_set]

        if new_items:
            new_payload = {"ok": True, "items": new_items}
            notify_text = "⚠️ Approval required.\n" + self.approvals_text(new_payload, prefix=prefix)
            self.send_message(
                bot_token=bot_token,
                chat_id=chat_id,
                text=notify_text,
                workspace_id=workspace_id,
                action="approval_notify",
                connector_id=connector_id,
                profile=profile,
                include_keyboard=False,
            )
            patch["last_approval_notified_at"] = self.utc_now_iso()
            patch["last_approval_notified_count"] = len(new_items)

        patch["notified_approval_ids"] = pending_ids[:40]
        patch["last_pending_approval_count"] = len(pending_ids)
        return patch
