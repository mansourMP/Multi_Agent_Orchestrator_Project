from __future__ import annotations

import json
import threading
import time
from typing import Any, Callable, Optional


def chat_stream_payload(raw_event: dict[str, Any]) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    if not isinstance(raw_event, dict):
        return None, None
    event_name = str(raw_event.get("type") or "message").strip() or "message"
    if event_name == "final":
        payload = raw_event.get("payload") if isinstance(raw_event.get("payload"), dict) else {}
        return "final", payload
    payload = {key: value for key, value in raw_event.items() if key != "type"}
    return event_name, payload


def chat_stream_error_payload(message: str) -> dict[str, Any]:
    detail = str(message or "").strip() or "unknown_error"
    return {
        "reply": f"Chat failed: {detail}",
        "actions": [],
        "mode": "answer",
        "error": detail,
    }


def extract_direct_chat_error_response(raw_event: Any) -> Optional[dict[str, str]]:
    if not isinstance(raw_event, dict):
        return None
    if str(raw_event.get("type") or "").strip().lower() != "final":
        return None
    payload = raw_event.get("payload") if isinstance(raw_event.get("payload"), dict) else {}
    error_code = str(payload.get("error") or "").strip()
    if error_code != "no_provider":
        return None
    message = str(payload.get("message") or "").strip() or "No AI provider configured"
    return {
        "error": "no_provider",
        "message": message,
    }


def start_chat_stream_producer(
    session: dict[str, Any],
    *,
    producer_fn: Callable[[], Any],
    append_event: Callable[[dict[str, Any], str, dict[str, Any]], None],
    complete_session: Callable[[dict[str, Any]], None],
    capture_exception: Callable[[Exception], None],
) -> None:
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    with condition:
        if bool(session.get("producer_started")):
            return
        session["producer_started"] = True

    def _producer_main() -> None:
        final_emitted = False
        try:
            for raw_event in producer_fn():
                event_name, payload = chat_stream_payload(raw_event)
                if not event_name or not isinstance(payload, dict):
                    continue
                if event_name == "final":
                    final_emitted = True
                append_event(session, event_name, payload)
        except Exception as exc:
            capture_exception(exc)
            if not final_emitted:
                append_event(session, "final", chat_stream_error_payload(str(exc)))
        finally:
            complete_session(session)

    worker = threading.Thread(
        target=_producer_main,
        daemon=True,
        name=f"chat-stream-{str(session.get('request_id') or '')[:10]}",
    )
    worker.start()


def iter_chat_stream_events(
    session: dict[str, Any],
    *,
    last_event_id: Any,
    normalize_cursor: Callable[[Any], int],
) -> Any:
    cursor = normalize_cursor(last_event_id)
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    while True:
        with condition:
            session["last_accessed_at"] = time.time()
            pending = [
                dict(item)
                for item in (session.get("events") if isinstance(session.get("events"), list) else [])
                if int(item.get("seq") or 0) > cursor
            ]
            completed = bool(session.get("completed"))
            if not pending and completed:
                break
            if not pending:
                condition.wait(timeout=15.0)
                continue
        for item in pending:
            cursor = int(item.get("seq") or cursor)
            yield f"id: {item['id']}\n".encode("utf-8")
            yield f"event: {item['event']}\n".encode("utf-8")
            yield f"data: {json.dumps(item.get('payload') or {}, ensure_ascii=False)}\n\n".encode("utf-8")
