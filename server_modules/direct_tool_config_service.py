from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Dict, List, Optional

from server_modules.capability_registry import resolve_capability
from server_modules import skills_service


def extract_first_email(text: str) -> str:
    return skills_service.extract_first_email(text)


def extract_subject_text(text: str) -> str:
    return skills_service.extract_subject_text(text)


def extract_body_text(text: str) -> str:
    return skills_service.extract_body_text(text)


def first_non_empty_line(text: str) -> str:
    return skills_service.first_non_empty_line(text)


def build_direct_tool_config(
    connector_id: str,
    action_id: str,
    tool_input: str,
    *,
    parse_json_object_loose: Callable[[str], Any],
) -> Dict[str, Any]:
    return skills_service.build_direct_tool_config(
        connector_id,
        action_id,
        tool_input,
        parse_json_object_loose=parse_json_object_loose,
    )


def build_direct_local_tool_config(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    return skills_service.build_direct_local_tool_config(
        connector_id,
        action_id,
        arguments,
    )


def tool_write_action_available(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    return skills_service.tool_write_action_available(
        connector_id,
        action_id,
        tool_capabilities,
    )


def approved_action_to_tool_call(
    approved_action: Dict[str, str],
    *,
    parse_json_object_loose: Callable[[str], Any],
) -> Dict[str, Any]:
    return skills_service.approved_action_to_tool_call(
        approved_action,
        parse_json_object_loose=parse_json_object_loose,
    )


def run_async_tool_call(coro: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

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
    raw_tool_name = str(first_action.get("tool") or result_data.get("tool_variant") or "").strip().lower()
    contract = resolve_capability(raw_tool_name)
    tool_name = str(contract.capability_id).strip().lower() if contract is not None else raw_tool_name

    if tool_name == "filesystem.read_write":
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

    if tool_name == "screenshot.capture":
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
