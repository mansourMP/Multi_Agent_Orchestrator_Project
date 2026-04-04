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
        approvals_list: Callable[[int], Dict[str, Any]],
        approvals_text: Callable[[Dict[str, Any], str], str],
        approval_resolve: Callable[[str, bool, str], Dict[str, Any]],
        approval_result_text: Callable[[Dict[str, Any], bool], str],
        create_run: Callable[..., Dict[str, Any]],
        run_dispatch_service: Callable[[], Any],
        record_channel_event: Callable[..., Any],
        set_connector_state: Callable[[str, Dict[str, Any]], Any],
        persist_state: Callable[[], Any],
        increment_processed: Callable[[], Any],
        autopilot_activate: Callable[[], Any],
        mark_inbound: Callable[..., Any],
        mark_error: Callable[[str], Any],
        utc_now_iso: Callable[[], str],
        default_chat_prefix: str,
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
        self.increment_processed = increment_processed
        self.autopilot_activate = autopilot_activate
        self.mark_inbound = mark_inbound
        self.mark_error = mark_error
        self.utc_now_iso = utc_now_iso
        self.default_chat_prefix = default_chat_prefix

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

    def handle_inbound(self, form: Dict[str, str]) -> str:
        self.autopilot_activate()
        account_sid = str(form.get("AccountSid") or "").strip()
        message_sid = str(form.get("MessageSid") or "").strip()
        inbound_from = self.normalize_number(form.get("From"))
        inbound_to = self.normalize_number(form.get("To"))
        body = str(form.get("Body") or "").strip()
        session_key = self.session_key_builder(inbound_from, inbound_to)
        trace_id = f"wa:{self.safe_path_token(inbound_to or 'to')}:{self.safe_path_token(message_sid or 'msg')}"

        self.mark_inbound(clear_error=True)
        matched = self.connector_match(account_sid, inbound_from, inbound_to)
        if not matched:
            detail = (
                f"No matching WhatsApp connector for inbound message "
                f"(account_sid={account_sid or 'unknown'}, to={inbound_to or 'unknown'})."
            )
            self.record_channel_event(
                channel="whatsapp",
                direction="inbound",
                event_type="message",
                text=body,
                session_key=session_key,
                session_id=session_key,
                message_id=message_sid or None,
                action="unmatched",
                metadata={
                    "account_sid": account_sid,
                    "message_sid": message_sid,
                    "to_number": inbound_to,
                    "trace_id": trace_id,
                    "delivery_status": "received",
                },
            )
            self.record_channel_event(
                channel="whatsapp",
                direction="system",
                event_type="error",
                text=detail,
                session_key=session_key,
                session_id=session_key,
                parent_id=message_sid or None,
                action="match_connector",
                metadata={
                    "account_sid": account_sid,
                    "message_sid": message_sid,
                    "to_number": inbound_to,
                    "trace_id": trace_id,
                },
            )
            self.mark_error(detail)
            return "Empyralis is not configured for this WhatsApp number."

        entry = matched.get("entry") if isinstance(matched.get("entry"), dict) else {}
        secret = matched.get("secret") if isinstance(matched.get("secret"), dict) else {}
        connector_id = str(matched.get("connector_id") or "").strip()
        workspace_id = str(matched.get("workspace_id") or "default")
        profile = self.resolve_profile(entry)
        routed = self.route_message(body, profile)
        action = str(routed.get("action") or "ignore").strip().lower()
        self.record_channel_event(
            channel="whatsapp",
            direction="inbound",
            event_type="message",
            text=body,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_key,
            message_id=message_sid or None,
            action=action,
            metadata={
                "connector_id": connector_id,
                "profile_id": profile.get("id"),
                "account_sid": account_sid,
                "message_sid": message_sid,
                "to_number": inbound_to,
                "trace_id": trace_id,
                "delivery_status": "received",
            },
        )

        if action == "ignore":
            return ""

        run_id = ""
        response_text = ""
        if action == "help":
            response_text = self.help_text(profile)
        elif action == "status":
            response_text = self.runtime_status_text(workspace_id)
        elif action == "approvals":
            limit = int(routed.get("limit") or 5)
            payload = self.approvals_list(limit)
            response_text = self.approvals_text(payload, prefix=str(profile.get("prefix") or self.default_chat_prefix))
        elif action == "approve":
            event_id = str(routed.get("event_id") or "").strip()
            note = str(routed.get("note") or "").strip()
            payload = self.approval_resolve(event_id, True, note)
            response_text = self.approval_result_text(payload, True)
        elif action == "reject":
            event_id = str(routed.get("event_id") or "").strip()
            note = str(routed.get("note") or "").strip()
            payload = self.approval_resolve(event_id, False, note)
            response_text = self.approval_result_text(payload, False)
        elif action == "run":
            goal = str(routed.get("goal") or "").strip()
            if not goal:
                response_text = self.help_text(profile)
                action = "help"
            else:
                run_info = self.create_run(
                    goal=goal,
                    workspace_id=workspace_id,
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
                    dispatch_service.start_finalize_thread(
                        run_id,
                        connector_id,
                        workspace_id,
                        profile,
                        secret,
                        inbound_from,
                    )
                else:
                    response_text = dispatch_service.ack_text("")
        else:
            action = "help"
            response_text = self.help_text(profile)

        state_patch: Dict[str, Any] = {
            "label": entry.get("label"),
            "workspace_id": workspace_id,
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
                text=response_text,
                workspace_id=workspace_id,
                session_key=session_key,
                run_id=run_id,
                action=action,
                metadata={
                    "connector_id": connector_id,
                    "profile_id": profile.get("id"),
                    "message_sid": message_sid,
                    "trace_id": trace_id,
                    "delivery_status": "sent",
                },
            )
        return response_text
