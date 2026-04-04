from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from scripts.platform_execution import stack_start_command_hint


class TelegramRunDispatchService:
    def __init__(
        self,
        *,
        project_root: Path,
        default_timeout_seconds: int,
        default_max_reply_chars: int,
        send_ack: bool,
        include_run_meta: Callable[[], bool],
        humanize_run_summary: Callable[[str], str],
        truncate_one_line: Callable[[str, int], str],
        runs_get: Callable[[str], Any],
        latest_run_error_message: Callable[[Dict[str, Any]], str],
        is_non_retryable_run_error: Callable[[str], bool],
        friendly_run_error: Callable[[str], str],
        summarize_run_terminal_result: Callable[[Dict[str, Any], int], str],
        local_companion_snapshot: Callable[[], Dict[str, int]],
        can_auto_approve_wait: Callable[[Dict[str, Any]], bool],
        pending_confirmation_payload: Callable[[Dict[str, Any]], Dict[str, Any]],
        time_now: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.project_root = Path(project_root)
        self.default_timeout_seconds = max(30, int(default_timeout_seconds or 30))
        self.default_max_reply_chars = max(80, int(default_max_reply_chars or 80))
        self.send_ack = bool(send_ack)
        self.include_run_meta = include_run_meta
        self.humanize_run_summary = humanize_run_summary
        self.truncate_one_line = truncate_one_line
        self.runs_get = runs_get
        self.latest_run_error_message = latest_run_error_message
        self.is_non_retryable_run_error = is_non_retryable_run_error
        self.friendly_run_error = friendly_run_error
        self.summarize_run_terminal_result = summarize_run_terminal_result
        self.local_companion_snapshot = local_companion_snapshot
        self.can_auto_approve_wait = can_auto_approve_wait
        self.pending_confirmation_payload = pending_confirmation_payload
        self.time_now = time_now
        self.sleep = sleep

    def run_reply_text(self, status: str, run_id: str, summary: str) -> str:
        cleaned_summary = self.humanize_run_summary(summary)
        if not self.include_run_meta():
            return cleaned_summary
        status_label = "⬢ completed" if str(status or "").strip().lower() == "completed" else "⬢ failed"
        if str(run_id or "").strip():
            return f"{status_label}\nrun_id: {run_id}\n{cleaned_summary}"
        return f"{status_label}\n{cleaned_summary}"

    def wait_for_terminal_status(
        self,
        run_id: str,
        timeout_seconds: Optional[int] = None,
        max_reply_chars: Optional[int] = None,
    ) -> Dict[str, Any]:
        wait_timeout = max(30, int(timeout_seconds if timeout_seconds is not None else self.default_timeout_seconds))
        summary_limit = int(max_reply_chars if max_reply_chars is not None else self.default_max_reply_chars)
        deadline = self.time_now() + wait_timeout
        auto_approved = False
        last_status = "starting"
        no_worker_since: Optional[float] = None
        no_worker_grace_seconds = max(8.0, min(20.0, float(wait_timeout) * 0.2))
        while self.time_now() < deadline:
            run = self.runs_get(run_id)
            if not isinstance(run, dict):
                return {"status": "failed", "summary": "Run not found."}
            latest_error = self.latest_run_error_message(run)
            if latest_error and self.is_non_retryable_run_error(latest_error):
                return {
                    "status": "failed",
                    "summary": self.friendly_run_error(latest_error),
                    "auto_approved": auto_approved,
                }
            status = str(run.get("status") or "").strip().lower()
            if status:
                last_status = status
            if status in {"completed", "failed", "timeout"}:
                summary = self.summarize_run_terminal_result(run, summary_limit)
                return {
                    "status": status,
                    "summary": summary,
                    "auto_approved": auto_approved,
                }
            if status in {"queued_local", "running_local"}:
                local_state = self.local_companion_snapshot()
                if local_state["online_workers"] <= 0 and local_state["claimed_runs"] <= 0:
                    if no_worker_since is None:
                        no_worker_since = self.time_now()
                    elif (self.time_now() - no_worker_since) >= no_worker_grace_seconds:
                        return {
                            "status": "failed",
                            "summary": (
                                "Local companion is offline. "
                                f"pending={local_state['pending_runs']} claimed={local_state['claimed_runs']} "
                                f"online_workers={local_state['online_workers']}. "
                                f"Start it with: {stack_start_command_hint(self.project_root)}"
                            ),
                            "auto_approved": auto_approved,
                        }
                else:
                    no_worker_since = None
            if status == "waiting_for_input" and not auto_approved and self.can_auto_approve_wait(run):
                pending = self.pending_confirmation_payload(run)
                approval_id = str(pending.get("approval_id") or "").strip()
                input_queue = run.get("input_queue")
                if approval_id and hasattr(input_queue, "put"):
                    input_queue.put({"approval_id": approval_id, "decision": "proceed"})
                    auto_approved = True
            self.sleep(1.0)
        run = self.runs_get(run_id)
        if isinstance(run, dict):
            latest_error = self.latest_run_error_message(run)
            if latest_error:
                return {
                    "status": "failed",
                    "summary": self.friendly_run_error(latest_error),
                    "auto_approved": auto_approved,
                }
        if last_status in {"queued_local", "running_local"}:
            local_state = self.local_companion_snapshot()
            return {
                "status": "timeout",
                "summary": (
                    "Run timed out waiting on Local Companion. "
                    f"last_status={last_status} pending={local_state['pending_runs']} "
                    f"claimed={local_state['claimed_runs']} online_workers={local_state['online_workers']}."
                ),
                "auto_approved": auto_approved,
            }
        if last_status:
            return {
                "status": "timeout",
                "summary": f"Run timed out while waiting for completion (last_status={last_status}).",
                "auto_approved": auto_approved,
            }
        return {"status": "timeout", "summary": "Run timed out while waiting for completion."}

    def dispatch_run_action(
        self,
        *,
        bot_token: str,
        chat_id: str,
        workspace_id: str,
        connector_id: str,
        sender_id: str,
        update_id: int,
        inbound_message_id: Optional[str],
        profile_context: Optional[Dict[str, str]],
        media_attachments: Optional[list[Dict[str, Any]]],
        skill_override: Optional[Dict[str, Any]],
        trace_id: str,
        source_event_id: str,
        connector_entry: Optional[Dict[str, Any]],
        connector_context: Optional[Dict[str, Any]],
        session_key: str,
        profile: Dict[str, Any],
        action: str,
        goal: str,
        create_run: Callable[..., Dict[str, Any]],
        record_channel_event: Callable[..., Any],
        send_chat_action: Callable[..., Any],
        send_message: Callable[..., str],
        edit_message: Callable[..., bool],
    ) -> Dict[str, Any]:
        run_info = create_run(
            goal=goal,
            workspace_id=workspace_id,
            connector_id=connector_id,
            chat_id=chat_id,
            sender_id=sender_id,
            update_id=update_id,
            message_id=inbound_message_id or None,
            profile_context=profile_context,
            media_attachments=media_attachments,
            skill_override=skill_override,
            trace_id=trace_id,
            source_event_id=source_event_id,
            connector_entry=connector_entry,
            connector_context=connector_context,
        )
        run_id = str(run_info.get("run_id") or "").strip()
        pending_message_id = ""
        if run_id and self.send_ack:
            send_chat_action(bot_token, chat_id, action="typing")
            ack_text = "Thinking..."
            if self.include_run_meta():
                ack_text += f"\nrun_id: {run_id}"
            pending_message_id = send_message(
                bot_token,
                chat_id,
                ack_text,
                workspace_id=workspace_id,
                action="thinking",
                run_id=run_id,
                connector_id=connector_id,
                parent_message_id=inbound_message_id or None,
                profile=profile,
                trace_id=trace_id,
                source_event_id=source_event_id,
            )

        result = self.wait_for_terminal_status(run_id)
        status = str(result.get("status") or "").lower()
        summary = self.truncate_one_line(
            str(result.get("summary") or "Run finished."),
            self.default_max_reply_chars,
        )
        final_reply = self.run_reply_text(status, run_id, summary)
        record_channel_event(
            channel="telegram",
            direction="system",
            event_type=f"run_{status if status in {'completed', 'failed', 'timeout'} else 'finished'}",
            text=summary,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_key,
            parent_id=inbound_message_id or None,
            run_id=run_id,
            action=action,
            metadata={
                "connector_id": connector_id,
                "profile_id": profile.get("id"),
                "trace_id": trace_id,
                "source_event_id": source_event_id,
            },
        )
        edited = False
        if pending_message_id:
            edited = edit_message(
                bot_token,
                chat_id,
                pending_message_id,
                final_reply,
                workspace_id=workspace_id,
                action=action,
                run_id=run_id,
                connector_id=connector_id,
                parent_message_id=inbound_message_id or None,
                profile=profile,
                trace_id=trace_id,
                source_event_id=source_event_id,
            )
        if not edited:
            send_message(
                bot_token,
                chat_id,
                final_reply,
                workspace_id=workspace_id,
                action=action,
                run_id=run_id,
                connector_id=connector_id,
                parent_message_id=inbound_message_id or None,
                profile=profile,
                trace_id=trace_id,
                source_event_id=source_event_id,
            )
        return {
            "run_id": run_id,
            "status": status,
            "summary": summary,
            "final_reply": final_reply,
            "pending_message_id": pending_message_id,
            "edited": edited,
            "route": run_info.get("route"),
        }
