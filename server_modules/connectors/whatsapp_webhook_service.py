from __future__ import annotations

from typing import Any, Callable, Dict, Optional
from urllib.parse import parse_qs


class WhatsAppWebhookService:
    def __init__(
        self,
        *,
        normalize_number: Callable[[Optional[str]], str],
        session_key_builder: Callable[[str, str], str],
        safe_path_token: Callable[[Any], str],
        connector_match: Callable[[str, str, str], Optional[Dict[str, Any]]],
        resolve_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
        route_message: Callable[[str, Dict[str, Any]], Dict[str, Any]],
        help_text: Callable[[Dict[str, Any]], str],
        runtime_status_text: Callable[[str], str],
        approvals_list: Callable[[int, Optional[str]], Dict[str, Any]],
        approvals_text: Callable[[Dict[str, Any], str], str],
        approval_resolve: Callable[[str, bool, str, Optional[str]], Dict[str, Any]],
        approval_result_text: Callable[[Dict[str, Any], bool], str],
        create_run: Callable[..., Dict[str, Any]],
        run_dispatch_service: Callable[[], Any],
        record_channel_event: Callable[..., Any],
        set_connector_state: Callable[[str, Dict[str, Any]], Any],
        persist_state: Callable[[], Any],
        mark_processed_message: Callable[[str, str], bool],
        increment_processed: Callable[[], Any],
        autopilot_activate: Callable[[], Any],
        mark_inbound: Callable[..., Any],
        mark_error: Callable[[str], Any],
        utc_now_iso: Callable[[], str],
        default_chat_prefix: str,
        require_explicit_opt_in: bool,
        redact_event_text: bool,
        retention_days: int,
        channel_pairing_service: Callable[[], Any],
    ) -> None:
        self.normalize_number = normalize_number
        self.session_key_builder = session_key_builder
        self.safe_path_token = safe_path_token
        self.connector_match = connector_match
        self.resolve_profile = resolve_profile
        self.route_message = route_message
        self.help_text = help_text
        self.runtime_status_text = runtime_status_text
        self.approvals_list = approvals_list
        self.approvals_text = approvals_text
        self.approval_resolve = approval_resolve
        self.approval_result_text = approval_result_text
        self.create_run = create_run
        self.run_dispatch_service = run_dispatch_service
        self.record_channel_event = record_channel_event
        self.set_connector_state = set_connector_state
        self.persist_state = persist_state
        self.mark_processed_message = mark_processed_message
        self.increment_processed = increment_processed
        self.autopilot_activate = autopilot_activate
        self.mark_inbound = mark_inbound
        self.mark_error = mark_error
        self.utc_now_iso = utc_now_iso
        self.default_chat_prefix = default_chat_prefix
        self.require_explicit_opt_in = bool(require_explicit_opt_in)
        self.redact_event_text = bool(redact_event_text)
        self.retention_days = max(1, int(retention_days or 30))
        self.channel_pairing_service = channel_pairing_service

    def _event_text(self, text: Any) -> str:
        clean = str(text or "").strip()
        if not clean:
            return ""
        if not self.redact_event_text:
            return clean
        return "[redacted]"

    def _event_metadata(self, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = dict(metadata or {})
        payload["privacy_mode"] = "channel_redacted" if self.redact_event_text else "channel_plaintext"
        payload["retention_days"] = self.retention_days
        payload["redacted_text"] = self.redact_event_text
        return payload

    def _link_scopes_allow_chat(self, link: Optional[Dict[str, Any]]) -> bool:
        if not isinstance(link, dict):
            return False
        scopes = {str(item or "").strip().lower() for item in (link.get("scopes") or [])}
        required = {"chat", "whatsapp:chat"}
        if not required.issubset(scopes):
            return False
        if self.require_explicit_opt_in and "whatsapp:opt_in" not in scopes:
            return False
        return True

    def parse_form_urlencoded(self, raw: bytes) -> Dict[str, str]:
        decoded = raw.decode("utf-8", errors="ignore") if raw else ""
        parsed = parse_qs(decoded, keep_blank_values=True)
        out: Dict[str, str] = {}
        for key, values in parsed.items():
            if isinstance(values, list) and values:
                out[str(key)] = str(values[-1])
            else:
                out[str(key)] = ""
        return out

    def handle_inbound(self, form: Dict[str, str], *, matched: Optional[Dict[str, Any]] = None) -> str:
        self.autopilot_activate()
        account_sid = str(form.get("AccountSid") or "").strip()
        message_sid = str(form.get("MessageSid") or "").strip()
        inbound_from = self.normalize_number(form.get("From"))
        inbound_to = self.normalize_number(form.get("To"))
        body = str(form.get("Body") or "").strip()
        session_key = self.session_key_builder(inbound_from, inbound_to)
        trace_id = f"wa:{self.safe_path_token(inbound_to or 'to')}:{self.safe_path_token(message_sid or 'msg')}"

        self.mark_inbound(clear_error=True)
        matched = matched or self.connector_match(account_sid, inbound_from, inbound_to)
        if not matched:
            detail = (
                f"No matching WhatsApp connector for inbound message "
                f"(account_sid={account_sid or 'unknown'}, to={inbound_to or 'unknown'})."
            )
            self.record_channel_event(
                channel="whatsapp",
                direction="inbound",
                event_type="message",
                text=self._event_text(body),
                session_key=session_key,
                session_id=session_key,
                message_id=message_sid or None,
                action="unmatched",
                metadata=self._event_metadata({
                    "account_sid": account_sid,
                    "message_sid": message_sid,
                    "to_number": inbound_to,
                    "trace_id": trace_id,
                    "delivery_status": "received",
                }),
            )
            self.record_channel_event(
                channel="whatsapp",
                direction="system",
                event_type="error",
                text=self._event_text(detail),
                session_key=session_key,
                session_id=session_key,
                parent_id=message_sid or None,
                action="match_connector",
                metadata=self._event_metadata({
                    "account_sid": account_sid,
                    "message_sid": message_sid,
                    "to_number": inbound_to,
                    "trace_id": trace_id,
                }),
            )
            self.mark_error(detail)
            return "Empyralis is not configured for this WhatsApp number."

        entry = matched.get("entry") if isinstance(matched.get("entry"), dict) else {}
        secret = matched.get("secret") if isinstance(matched.get("secret"), dict) else {}
        connector_id = str(matched.get("connector_id") or "").strip()
        workspace_id = str(matched.get("workspace_id") or "default")
        if message_sid and not self.mark_processed_message(connector_id, message_sid):
            self.record_channel_event(
                channel="whatsapp",
                direction="system",
                event_type="duplicate",
                text=self._event_text("Duplicate WhatsApp inbound ignored."),
                workspace_id=workspace_id,
                session_key=session_key,
                session_id=session_key,
                parent_id=message_sid or None,
                action="duplicate_ignored",
                metadata=self._event_metadata({
                    "connector_id": connector_id,
                    "message_sid": message_sid,
                    "trace_id": trace_id,
                }),
            )
            return ""
        pair_resolution = self.channel_pairing_service().authorize_channel_message(
            provider="whatsapp",
            external_subject=inbound_from,
            workspace_id=workspace_id,
            message_text=body,
            observed_metadata={
                "to_number": inbound_to or None,
                "account_sid": account_sid or None,
                "connector_id": connector_id,
                "message_sid": message_sid or None,
            },
        )
        if not bool(pair_resolution.get("authorized")):
            return str(pair_resolution.get("reply_text") or "").strip()

        active_link = pair_resolution.get("link") if isinstance(pair_resolution.get("link"), dict) else {}
        if not self._link_scopes_allow_chat(active_link):
            return (
                "This WhatsApp number is not opted in for Empyralis chat yet. "
                "Create a fresh pairing code in Empyralis and send `pair CODE` here."
            )

        resolved_workspace_id = str(pair_resolution.get("workspace_id") or workspace_id).strip() or workspace_id
        profile = self.resolve_profile(entry)
        routed = self.route_message(body, profile)
        action = str(routed.get("action") or "ignore").strip().lower()
        self.record_channel_event(
            channel="whatsapp",
            direction="inbound",
            event_type="message",
            text=self._event_text(body),
            workspace_id=resolved_workspace_id,
            session_key=session_key,
            session_id=session_key,
            message_id=message_sid or None,
            action=action,
            metadata=self._event_metadata({
                "connector_id": connector_id,
                "profile_id": profile.get("id"),
                "account_sid": account_sid,
                "message_sid": message_sid,
                "to_number": inbound_to,
                "trace_id": trace_id,
                "delivery_status": "received",
                "link_id": active_link.get("link_id"),
            }),
        )

        if action == "ignore":
            return ""

        run_id = ""
        response_text = ""
        if action == "help":
            response_text = self.help_text(profile)
        elif action == "status":
            response_text = self.runtime_status_text(resolved_workspace_id)
        elif action == "approvals":
            limit = int(routed.get("limit") or 5)
            payload = self.approvals_list(limit, resolved_workspace_id)
            response_text = self.approvals_text(payload, prefix=str(profile.get("prefix") or self.default_chat_prefix))
        elif action == "approve":
            event_id = str(routed.get("event_id") or "").strip()
            note = str(routed.get("note") or "").strip()
            payload = self.approval_resolve(event_id, True, note, resolved_workspace_id)
            response_text = self.approval_result_text(payload, True)
        elif action == "reject":
            event_id = str(routed.get("event_id") or "").strip()
            note = str(routed.get("note") or "").strip()
            payload = self.approval_resolve(event_id, False, note, resolved_workspace_id)
            response_text = self.approval_result_text(payload, False)
        elif action == "run":
            goal = str(routed.get("goal") or "").strip()
            if not goal:
                response_text = self.help_text(profile)
                action = "help"
            else:
                run_info = self.create_run(
                    goal=goal,
                    workspace_id=resolved_workspace_id,
                    connector_id=connector_id,
                    from_number=inbound_from,
                    to_number=inbound_to,
                    message_sid=message_sid,
                    account_sid=account_sid,
                    connector_entry=entry,
                )
                run_id = str(run_info.get("run_id") or "")
                dispatch_service = self.run_dispatch_service()
                if run_id:
                    response_text = dispatch_service.ack_text(run_id)
                    dispatch_service.schedule_final_delivery(
                        workspace_id=resolved_workspace_id,
                        connector_id=connector_id,
                        run_id=run_id,
                        reply_to_number=inbound_from,
                        trace_id=trace_id,
                    )
                else:
                    response_text = dispatch_service.ack_text("")
        else:
            action = "help"
            response_text = self.help_text(profile)

        state_patch: Dict[str, Any] = {
            "label": entry.get("label"),
            "workspace_id": resolved_workspace_id,
            "profile_id": profile.get("id"),
            "last_action": action,
            "last_error": None,
            "last_error_category": None,
            "last_error_at": None,
            "last_message_sid": message_sid,
            "last_from_number": inbound_from,
            "last_to_number": inbound_to,
            "last_processed_at": self.utc_now_iso(),
        }
        if run_id:
            state_patch["last_run_id"] = run_id
        self.set_connector_state(connector_id, state_patch)
        self.increment_processed()
        self.persist_state()
        if response_text:
            self.record_channel_event(
                channel="whatsapp",
                direction="outbound",
                event_type="message",
                text=self._event_text(response_text),
                workspace_id=resolved_workspace_id,
                session_key=session_key,
                run_id=run_id,
                action=action,
                metadata=self._event_metadata({
                    "connector_id": connector_id,
                    "profile_id": profile.get("id"),
                    "message_sid": message_sid,
                    "trace_id": trace_id,
                    "delivery_status": "sent",
                    "link_id": active_link.get("link_id"),
                }),
            )
        return response_text
