from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable, Dict, List, Optional


def extract_first_email(text: str) -> str:
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", str(text or ""), flags=re.IGNORECASE)
    return match.group(0).strip() if match else ""


def extract_subject_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (
        r"subject\s*[:=]\s*([^\n]+)",
        r"subject\s+(.+?)(?:(?:\s+(?:body|message|content)\s*:?)|$)",
    ):
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip(" \"'")
    return ""


def extract_body_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (r"(?:body|message|content|saying)\s*[:=]?\s+(.+)$",):
        match = re.search(pattern, raw, flags=re.IGNORECASE | re.DOTALL)
        if match:
            body = str(match.group(1) or "").strip()
            if body:
                return body
    return raw


def first_non_empty_line(text: str) -> str:
    for line in str(text or "").splitlines():
        token = line.strip()
        if token:
            return token
    return ""


def build_direct_tool_config(
    connector_id: str,
    action_id: str,
    tool_input: str,
    *,
    parse_json_object_loose: Callable[[str], Any],
) -> Dict[str, Any]:
    config: Dict[str, Any] = {
        "connector": connector_id,
        "action_id": action_id,
    }
    parsed_input = parse_json_object_loose(tool_input) or {}

    if connector_id == "telegram_bot":
        for key in ("chat_id", "session_key"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        config["text"] = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or tool_input
        ).strip()
        return config

    if connector_id == "slack":
        for key in ("channel", "channel_id", "user_id", "recipient_id", "thread_ts", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        if action_id in {"send_message", "send_dm", "post_reply"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_channels", "get_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 200))
        return config

    if connector_id == "discord_bot":
        for key in ("channel_id", "guild_id", "user_id", "message_id", "emoji", "name", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        files = parsed_input.get("files")
        if isinstance(files, list) and files:
            config["files"] = files
        embeds = parsed_input.get("embeds")
        if isinstance(embeds, list) and embeds:
            config["embeds"] = embeds
        if action_id in {"send_message", "send_dm", "edit_message", "send_embed"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_guilds", "list_members", "get_message_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 100))
        return config

    if connector_id == "smtp" and action_id in {"send_email", "send_message"}:
        to_email = str(
            parsed_input.get("to_email")
            or parsed_input.get("to")
            or parsed_input.get("email")
            or parsed_input.get("recipient")
            or extract_first_email(tool_input)
            or ""
        ).strip()
        subject = str(parsed_input.get("subject") or extract_subject_text(tool_input) or "").strip()
        body_text = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or extract_body_text(tool_input)
            or ""
        ).strip()
        if to_email:
            config["to_email"] = to_email
        if subject:
            config["subject"] = subject
        if body_text:
            config["text"] = body_text
        return config

    if connector_id == "smtp" and action_id == "fetch_emails":
        folder = str(parsed_input.get("folder") or "INBOX").strip() or "INBOX"
        try:
            limit = int(parsed_input.get("limit") or 10)
        except Exception:
            limit = 10
        config["folder"] = folder
        config["limit"] = max(1, min(limit, 50))
        if parsed_input.get("unread_only") is not None:
            config["unread_only"] = bool(parsed_input.get("unread_only"))
        return config

    if connector_id == "google_workspace" and action_id in {"send_email", "send_message", "draft_email"}:
        to_email = str(
            parsed_input.get("to_email")
            or parsed_input.get("to")
            or parsed_input.get("email")
            or parsed_input.get("recipient")
            or extract_first_email(tool_input)
            or ""
        ).strip()
        subject = str(parsed_input.get("subject") or extract_subject_text(tool_input) or "").strip()
        body_text = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or extract_body_text(tool_input)
            or ""
        ).strip()
        if to_email:
            config["to_email"] = to_email
        if subject:
            config["subject"] = subject
        if body_text:
            config["text"] = body_text
        return config

    if connector_id == "google_workspace" and action_id == "create_calendar_event":
        payload = parsed_input.get("payload") if isinstance(parsed_input.get("payload"), dict) else None
        if payload:
            config["payload"] = payload
        for key in ("title", "description", "start", "end", "timezone", "calendar_id"):
            value = parsed_input.get(key)
            if value is None:
                continue
            token = str(value).strip()
            if token:
                config[key] = token
        if "description" not in config and tool_input.strip():
            config["description"] = tool_input.strip()
        return config

    if connector_id == "google_workspace" and action_id in {"create_doc", "create_document", "create_sheet", "create_spreadsheet"}:
        title = str(
            parsed_input.get("title")
            or parsed_input.get("name")
            or first_non_empty_line(tool_input)
            or ""
        ).strip()
        if title:
            config["title"] = title[:180]
        return config

    if tool_input.strip():
        config["text"] = tool_input.strip()
    return config


def build_direct_local_tool_config(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    if connector_id == "file" and action_id == "read":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        if not path:
            raise RuntimeError("Tool 'file__read' requires a file path.")
        return "file", {
            "path": path,
            "mode": "read",
            "summary": f"Read local file: {path}",
        }
    if connector_id == "file" and action_id == "write":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        content = str(arguments.get("content") or "").strip()
        if not path or not content:
            raise RuntimeError("Tool 'file__write' requires path and content.")
        return "file", {
            "path": path,
            "content": content,
            "mode": "write",
            "summary": f"Write local file: {path}",
        }
    if connector_id == "shell" and action_id == "exec":
        command = str(arguments.get("command") or "").strip()
        if not command:
            raise RuntimeError("Tool 'shell__exec' requires a command.")
        return "shell", {
            "command": command,
            "summary": f"Execute shell command: {command}",
        }
    if connector_id == "screenshot" and action_id == "capture":
        return "screenshot", {
            "summary": "Capture screenshot of the current screen.",
        }
    if connector_id == "computer":
        if action_id == "ocr":
            return "computer", {
                "action": "ocr",
                "region": arguments.get("region"),
                "summary": "Read screen text with OCR.",
            }
        if action_id == "click":
            has_text = bool(str(arguments.get("text") or "").strip())
            has_coords = arguments.get("x") is not None and arguments.get("y") is not None
            if not has_text and not has_coords:
                raise RuntimeError("Tool 'computer__click' requires x/y or text.")
            return "computer", {
                "action": "click",
                "x": arguments.get("x"),
                "y": arguments.get("y"),
                "text": str(arguments.get("text") or "").strip() or None,
                "summary": "Click on the screen.",
            }
        if action_id == "type":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__type' requires text.")
            return "computer", {
                "action": "type",
                "text": text,
                "summary": "Type into the active application.",
            }
        if action_id == "applescript":
            script = str(arguments.get("script") or arguments.get("input") or "").strip()
            if not script:
                raise RuntimeError("Tool 'computer__applescript' requires a script.")
            return "computer", {
                "action": "applescript",
                "script": script,
                "summary": "Run AppleScript.",
            }
        if action_id == "clipboard_read":
            return "computer", {
                "action": "clipboard_read",
                "summary": "Read the system clipboard.",
            }
        if action_id == "clipboard_write":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__clipboard_write' requires text.")
            return "computer", {
                "action": "clipboard_write",
                "text": text,
                "summary": "Write to the system clipboard.",
            }
        if action_id == "notify":
            title = str(arguments.get("title") or "").strip()
            message = str(arguments.get("message") or arguments.get("text") or "").strip()
            if not title or not message:
                raise RuntimeError("Tool 'computer__notify' requires title and message.")
            return "computer", {
                "action": "notify",
                "title": title,
                "message": message,
                "summary": "Send a system notification.",
            }
        if action_id == "list_apps":
            return "computer", {
                "action": "list_apps",
                "summary": "List running applications.",
            }
        if action_id == "launch_app":
            name_or_path = str(arguments.get("name_or_path") or arguments.get("input") or "").strip()
            if not name_or_path:
                raise RuntimeError("Tool 'computer__launch_app' requires name_or_path.")
            return "computer", {
                "action": "launch_app",
                "name_or_path": name_or_path,
                "summary": f"Launch application: {name_or_path}",
            }
        if action_id == "speak":
            text = str(arguments.get("text") or arguments.get("input") or "").strip()
            if not text:
                raise RuntimeError("Tool 'computer__speak' requires text.")
            voice = str(arguments.get("voice") or "").strip()
            return "computer", {
                "action": "speak",
                "text": text,
                "voice": voice or None,
                "summary": "Speak text aloud.",
            }
    raise RuntimeError(f"Unsupported direct local tool '{connector_id}__{action_id}'.")


def tool_write_action_available(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if normalized_connector_id in {"file", "shell", "screenshot"}:
        return normalized_action_id in {"read", "write", "exec", "capture"}
    if normalized_connector_id == "computer":
        return normalized_action_id in {
            "ocr",
            "click",
            "type",
            "applescript",
            "clipboard_read",
            "clipboard_write",
            "notify",
            "list_apps",
            "launch_app",
            "speak",
        }
    if normalized_connector_id == "http":
        return normalized_action_id == "request"
    for item in tool_capabilities:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "").strip().lower() != normalized_connector_id:
            continue
        if not bool(item.get("connected")):
            return False
        write_actions = item.get("write_actions") if isinstance(item.get("write_actions"), list) else []
        return normalized_action_id in {str(entry or "").strip() for entry in write_actions}
    return False


def approved_action_to_tool_call(
    approved_action: Dict[str, str],
    *,
    parse_json_object_loose: Callable[[str], Any],
) -> Dict[str, Any]:
    connector_id = str(approved_action.get("connector") or "").strip().lower()
    raw_input = str(approved_action.get("input") or "").strip()
    if connector_id in {"file", "shell", "screenshot", "http", "computer"}:
        parsed_input = parse_json_object_loose(raw_input)
        arguments = parsed_input if isinstance(parsed_input, dict) else ({} if connector_id == "screenshot" else {"input": raw_input})
    else:
        arguments = {"input": raw_input}
    tool_name = f"{approved_action['connector']}__{approved_action['action']}"
    if connector_id == "http" and str(approved_action.get("action") or "").strip() == "request":
        tool_name = "http_request"
    return {
        "name": tool_name,
        "arguments": json.dumps(arguments, ensure_ascii=False),
    }


def run_async_tool_call(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" not in str(exc):
            raise

    import threading

    result: Dict[str, Any] = {}
    failure: Dict[str, BaseException] = {}

    def _runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as err:  # pragma: no cover
            failure["error"] = err

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if "error" in failure:
        raise failure["error"]
    return result.get("value")


def format_direct_tool_result(result: Dict[str, Any]) -> str:
    if not isinstance(result, dict):
        return str(result or "").strip()
    summary = str(result.get("summary") or "").strip()
    result_data = result.get("result_data") if isinstance(result.get("result_data"), dict) else {}
    connector_action = result_data.get("connector_action") if isinstance(result_data.get("connector_action"), dict) else {}
    highlights: List[str] = []
    for key, label in (
        ("recipient", "Recipient"),
        ("subject", "Subject"),
        ("chat_id", "Chat"),
        ("title", "Title"),
        ("calendar_id", "Calendar"),
        ("path", "Path"),
    ):
        value = str(connector_action.get(key) or "").strip()
        if value:
            highlights.append(f"{label}: {value}")
    if summary and highlights:
        return "\n".join([summary, *highlights])
    if summary:
        return summary
    if connector_action:
        try:
            return json.dumps(connector_action, ensure_ascii=True, indent=2)
        except Exception:
            return str(connector_action)
    try:
        return json.dumps(result, ensure_ascii=True, indent=2)
    except Exception:
        return str(result)


def format_direct_local_tool_result(result: Dict[str, Any]) -> str:
    if not isinstance(result, dict):
        return str(result or "").strip()
    summary = str(result.get("summary") or "").strip()
    result_data = result.get("result_data") if isinstance(result.get("result_data"), dict) else {}
    child_result = result_data.get("child_result") if isinstance(result_data.get("child_result"), dict) else {}
    outputs = child_result.get("outputs") if isinstance(child_result.get("outputs"), dict) else {}
    actions = outputs.get("actions") if isinstance(outputs.get("actions"), list) else []
    artifacts = outputs.get("artifacts") if isinstance(outputs.get("artifacts"), list) else []
    first_action = actions[0] if actions and isinstance(actions[0], dict) else {}
    first_artifact = artifacts[0] if artifacts and isinstance(artifacts[0], dict) else {}
    tool_name = str(first_action.get("tool") or result_data.get("tool_variant") or "").strip().lower()

    if tool_name == "read_write_files":
        mode = str(first_action.get("mode") or "").strip().lower()
        path = str(first_action.get("path") or first_action.get("file_path") or "").strip()
        if mode == "read":
            preview = str(first_action.get("content_preview") or "").strip()
            return "\n".join(part for part in [f"Read file: {path}" if path else summary, preview] if part).strip()
        if mode == "write":
            return f"Wrote file: {path}" if path else (summary or "File write completed.")

    if tool_name == "run_command":
        command = str(first_action.get("command") or "").strip()
        output_preview = str(first_action.get("output_preview") or "").strip()
        return "\n".join(part for part in [summary or (f"Command completed: {command}" if command else ""), output_preview] if part).strip()

    if tool_name == "capture_screenshot":
        artifact_path = str(first_artifact.get("path") or "").strip()
        return artifact_path or summary or "Screenshot captured."

    if tool_name == "computer_control":
        action = str(first_action.get("action") or "").strip().lower()
        payload = first_action.get("result")
        if payload is None:
            payload = first_action.get("output")
        if isinstance(payload, (dict, list)):
            payload_text = json.dumps(payload, ensure_ascii=False, indent=2)
        else:
            payload_text = str(payload or "").strip()
        if action == "ocr":
            return payload_text or "OCR completed."
        if action == "click":
            return payload_text or "Click completed."
        if action == "type":
            return payload_text or "Typed text."
        if action == "applescript":
            return payload_text or "AppleScript executed."
        if action == "clipboard_read":
            return payload_text or "Clipboard read completed."
        if action == "clipboard_write":
            return payload_text or "Clipboard updated."
        if action == "notify":
            return payload_text or "Notification sent."
        if action == "list_apps":
            return payload_text or "Listed running applications."
        if action == "launch_app":
            return payload_text or "Application launched."
        if action == "speak":
            return payload_text or "Speech completed."

    artifact_path = str(first_artifact.get("path") or "").strip()
    if artifact_path:
        return artifact_path
    if summary:
        return summary
    try:
        return json.dumps(result, ensure_ascii=True, indent=2)
    except Exception:
        return str(result)
