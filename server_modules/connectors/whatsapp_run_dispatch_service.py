from __future__ import annotations

import threading
from typing import Any, Callable, Dict


class WhatsAppRunDispatchService:
    def __init__(
        self,
        *,
        default_timeout_seconds: int,
        default_max_reply_chars: int,
        send_ack: bool,
        include_run_meta: Callable[[], bool],
        truncate_one_line: Callable[[str, int], str],
        wait_for_run_terminal_status: Callable[..., Dict[str, Any]],
        run_reply_text: Callable[[str, str, str], str],
        send_whatsapp_message: Callable[..., Dict[str, Any]],
        append_dead_letter: Callable[..., Any],
        record_channel_event: Callable[..., Any],
        set_connector_state: Callable[..., Any],
        utc_now_iso: Callable[[], str],
        classify_error: Callable[[str], str],
        log_error: Callable[[str], Any],
        mark_error: Callable[[str], Any],
        session_key_builder: Callable[[str, str], str],
        safe_path_token: Callable[[Any], str],
    ) -> None:
        self.default_timeout_seconds = max(30, int(default_timeout_seconds or 30))
        self.default_max_reply_chars = max(80, int(default_max_reply_chars or 80))
        self.send_ack = bool(send_ack)
        self.include_run_meta = include_run_meta
        self.truncate_one_line = truncate_one_line
        self.wait_for_run_terminal_status = wait_for_run_terminal_status
        self.run_reply_text = run_reply_text
        self.send_whatsapp_message = send_whatsapp_message
        self.append_dead_letter = append_dead_letter
        self.record_channel_event = record_channel_event
        self.set_connector_state = set_connector_state
        self.utc_now_iso = utc_now_iso
        self.classify_error = classify_error
        self.log_error = log_error
        self.mark_error = mark_error
        self.session_key_builder = session_key_builder
        self.safe_path_token = safe_path_token

    def ack_text(self, run_id: str) -> str:
        if not self.send_ack:
            return ""
        message = "⏣ Empyralis started your request."
        if run_id and self.include_run_meta():
            message += f"\nrun_id: {run_id}"
        return message

    def finalize_run_async(
        self,
        run_id: str,
        connector_id: str,
        workspace_id: str,
        profile: Dict[str, Any],
        secret: Dict[str, Any],
        reply_to_number: str,
    ) -> None:
        session_key = self.session_key_builder(reply_to_number, str(secret.get("from_number") or ""))
        trace_id = f"wa:{self.safe_path_token(connector_id)}:{self.safe_path_token(run_id)[:12]}"
        try:
            result = self.wait_for_run_terminal_status(
                run_id,
                timeout_seconds=self.default_timeout_seconds,
                max_reply_chars=self.default_max_reply_chars,
            )
            status = str(result.get("status") or "").lower()
            summary = self.truncate_one_line(
                str(result.get("summary") or "Run finished."),
                self.default_max_reply_chars,
            )
            message = self.run_reply_text(status, run_id, summary)
            try:
                sent = self.send_whatsapp_message(
                    account_sid=str(secret.get("account_sid") or ""),
                    auth_token=str(secret.get("auth_token") or ""),
                    from_number=str(secret.get("from_number") or ""),
                    to_number=reply_to_number,
                    body=message,
                )
            except Exception as send_exc:
                self.append_dead_letter(
                    channel="whatsapp",
                    direction="outbound",
                    event_type="message",
                    reason=str(send_exc),
                    text=message,
                    workspace_id=workspace_id,
                    session_key=session_key,
                    run_id=run_id,
                    action="run",
                    connector_id=connector_id,
                    trace_id=trace_id,
                    metadata={"transport": "twilio_messages_api"},
                )
                raise
            outbound_message_id = str(sent.get("sid") or "").strip() if isinstance(sent, dict) else ""
            self.record_channel_event(
                channel="whatsapp",
                direction="outbound",
                event_type="message",
                text=message,
                workspace_id=workspace_id,
                session_key=session_key,
                session_id=session_key,
                message_id=outbound_message_id or None,
                run_id=run_id,
                action="run",
                metadata={
                    "connector_id": connector_id,
                    "profile_id": profile.get("id"),
                    "trace_id": trace_id,
                    "delivery_status": "sent",
                },
            )
            self.record_channel_event(
                channel="whatsapp",
                direction="system",
                event_type=f"run_{status if status in {'completed', 'failed', 'timeout'} else 'finished'}",
                text=summary,
                workspace_id=workspace_id,
                session_key=session_key,
                session_id=session_key,
                run_id=run_id,
                action="run",
                metadata={"connector_id": connector_id, "profile_id": profile.get("id"), "trace_id": trace_id},
            )
            self.set_connector_state(
                connector_id,
                {
                    "workspace_id": workspace_id,
                    "profile_id": profile.get("id"),
                    "last_run_id": run_id,
                    "last_action": "run",
                    "last_error": None,
                    "last_error_category": None,
                    "last_error_at": None,
                    "last_processed_at": self.utc_now_iso(),
                },
            )
        except Exception as exc:
            detail = str(exc)
            category = self.classify_error(detail)
            self.log_error(f"finalize error run_id={run_id}: {detail}")
            self.record_channel_event(
                channel="whatsapp",
                direction="system",
                event_type="error",
                text=detail,
                workspace_id=workspace_id,
                session_key=session_key,
                session_id=session_key,
                run_id=run_id,
                action="run",
                metadata={"connector_id": connector_id, "profile_id": profile.get("id")},
            )
            self.set_connector_state(
                connector_id,
                {
                    "workspace_id": workspace_id,
                    "profile_id": profile.get("id"),
                    "last_run_id": run_id,
                    "last_action": "run",
                    "last_error": detail,
                    "last_error_category": category,
                    "last_error_at": self.utc_now_iso(),
                    "last_processed_at": self.utc_now_iso(),
                },
            )
            self.mark_error(detail)

    def start_finalize_thread(
        self,
        run_id: str,
        connector_id: str,
        workspace_id: str,
        profile: Dict[str, Any],
        secret: Dict[str, Any],
        reply_to_number: str,
    ) -> threading.Thread:
        thread = threading.Thread(
            target=self.finalize_run_async,
            args=(run_id, connector_id, workspace_id, profile, secret, reply_to_number),
            daemon=True,
        )
        thread.start()
        return thread
