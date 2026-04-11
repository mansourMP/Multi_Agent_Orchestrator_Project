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
    ) -> None:
        self.default_chat_prefix = str(default_chat_prefix or "").strip()
        self.cognitive_module = cognitive_module
        self.cognitive_defaults = cognitive_defaults
        self.truncate_one_line = truncate_one_line
        self.normalize_string_list = normalize_string_list
        self.utc_now_iso = utc_now_iso
        self.send_message = send_message
        self.ensure_workspace_approvals_access = ensure_workspace_approvals_access

    def approvals_list(self, limit: int = 5, workspace_id: Optional[str] = None) -> Dict[str, Any]:
        if workspace_id and callable(self.ensure_workspace_approvals_access):
            try:
                self.ensure_workspace_approvals_access(str(workspace_id or "").strip())
            except Exception as exc:
                return {"ok": False, "error": getattr(exc, "detail", str(exc) or "approvals_unavailable")}
        mod = self.cognitive_module()
        if mod is None:
            return {"ok": False, "error": "cognitive_daemon_unavailable"}
        conf = self.cognitive_defaults()
        try:
            items = mod.list_pending_approvals(
                db_path=conf["db_path"],
                niche_id=conf["niche_id"],
                limit=max(1, min(20, int(limit))),
            )
            return {"ok": True, "items": items, "count": len(items)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

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
        mod = self.cognitive_module()
        if mod is None:
            return {"ok": False, "error": "cognitive_daemon_unavailable"}
        conf = self.cognitive_defaults()
        try:
            out = mod.resolve_event_approval(
                db_path=conf["db_path"],
                event_id=str(event_id or "").strip(),
                approved=bool(approved),
                note=str(note or "").strip(),
            )
            return out if isinstance(out, dict) else {"ok": False, "error": "invalid_resolve_response"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def pending_approval_event_id(self, item: Dict[str, Any]) -> str:
        return str(item.get("event_id") or "").strip()

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
        event_id = str(payload.get("event_id") or "").strip()
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
