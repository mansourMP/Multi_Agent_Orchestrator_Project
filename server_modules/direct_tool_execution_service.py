from __future__ import annotations
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from server_modules import skills_service


@dataclass(frozen=True)
class DirectToolExecutionCallbacks:
    compact_step_detail: Callable[[Any], Optional[str]]
    titleize_direct_step_token: Callable[[str], str]
    run_async_tool_call: Callable[[Any], Any]
    parse_tool_name: Callable[[str], tuple[str, str]]
    tool_arguments_payload: Callable[[Any], Dict[str, Any]]
    parse_json_object_loose: Callable[[str], Any]
    safe_positive_int: Callable[[Any, int], int]
    normalize_reasoning_effort: Callable[[str], Optional[str]]
    build_direct_local_tool_config: Callable[[str, str, Dict[str, Any]], tuple[str, Dict[str, Any]]]
    format_direct_local_tool_result: Callable[[Any], str]
    build_direct_tool_config: Callable[[str, str, str], Dict[str, Any]]
    format_direct_tool_result: Callable[[Any], str]
    llm_task: Callable[..., Any]
    web_search: Callable[[str], List[Dict[str, Any]]]
    web_fetch: Callable[[str], str]
    search_memory_notebook: Callable[..., Any]
    get_memory_notebook_excerpt: Callable[..., Any]


def direct_tool_step_payload(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    *,
    step_id: str,
    status: str,
    detail_override: Optional[str] = None,
    callbacks: DirectToolExecutionCallbacks,
) -> Dict[str, Any]:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    label = "Running tool"
    kind = "connector"
    detail = callbacks.compact_step_detail(detail_override)

    if normalized_connector == "file" and normalized_action == "read":
        label = "Reading file"
        kind = "file"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "file" and normalized_action == "write":
        label = "Writing file"
        kind = "file"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "shell" and normalized_action == "exec":
        label = "Running command"
        kind = "shell"
        detail = detail or callbacks.compact_step_detail(arguments.get("command"))
    elif normalized_connector == "screenshot" and normalized_action == "capture":
        label = "Capturing screenshot"
        kind = "screenshot"
        detail = detail or callbacks.compact_step_detail(arguments.get("path") or arguments.get("file_path") or "Current screen")
    elif normalized_connector == "computer":
        kind = "computer"
        if normalized_action == "ocr":
            label = "Reading screen"
        elif normalized_action == "click":
            label = "Clicking screen"
            detail = detail or callbacks.compact_step_detail(arguments.get("text") or f"{arguments.get('x')}, {arguments.get('y')}")
        elif normalized_action == "type":
            label = "Typing text"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        elif normalized_action == "applescript":
            label = "Running AppleScript"
        elif normalized_action == "clipboard_read":
            label = "Reading clipboard"
        elif normalized_action == "clipboard_write":
            label = "Writing clipboard"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        elif normalized_action == "notify":
            label = "Sending notification"
            detail = detail or callbacks.compact_step_detail(arguments.get("title"))
        elif normalized_action == "list_apps":
            label = "Listing apps"
        elif normalized_action == "launch_app":
            label = "Launching app"
            detail = detail or callbacks.compact_step_detail(arguments.get("name_or_path"))
        elif normalized_action == "speak":
            label = "Speaking text"
            detail = detail or callbacks.compact_step_detail(arguments.get("text"))
        else:
            label = "Computer control"
    else:
        action_label = callbacks.titleize_direct_step_token(normalized_action) or "Connector action"
        connector_label = callbacks.titleize_direct_step_token(normalized_connector) or normalized_connector
        label = action_label
        kind = "connector"
        detail = detail or connector_label

    return {
        "type": "step",
        "id": step_id,
        "kind": kind,
        "label": label,
        "detail": detail,
        "status": status,
    }


def thinking_step_payload(iteration: int, status: str, detail: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "step",
        "id": f"thinking:{iteration}",
        "kind": "thinking",
        "label": "Thinking",
        "detail": detail or ("Planning the response" if iteration <= 1 else "Planning the next step"),
        "status": status,
    }


def extract_first_url(value: str) -> str:
    match = re.search(r"https?://[^\s)>\]}]+", str(value or ""), flags=re.IGNORECASE)
    if match:
        return str(match.group(0) or "").rstrip(".,!?;:")
    bare_match = re.search(
        r"\b((?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s)>\]}]+)?)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not bare_match:
        return ""
    token = str(bare_match.group(1) or "").rstrip(".,!?;:")
    if "." not in token:
        return ""
    return f"https://{token}"


def extract_first_path_reference(value: str) -> str:
    matches = re.findall(
        r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])([^\s,;:]+)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not matches:
        bare_match = re.search(
            r"\b((?:[a-z0-9_.-]+/)+[a-z0-9_.-]+(?:\.[a-z0-9_.-]+)?)\b",
            str(value or ""),
            flags=re.IGNORECASE,
        )
        if not bare_match:
            return ""
        candidate = str(bare_match.group(1) or "").rstrip(".,!?;:")
        if "://" in candidate:
            return ""
        return candidate
    _prefix, root, remainder = matches[0]
    return f"{root}{remainder}".strip()


def resolve_chat_local_path(raw_path: str) -> Path:
    candidate = Path(str(raw_path or "").strip()).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate


def direct_tool_followup_message(tool_name: str, result_text: str) -> str:
    cleaned_result = str(result_text or "").strip() or "No result."
    return (
        f"Tool result for {tool_name}:\n{cleaned_result}\n\n"
        "Continue until the task is complete. If another tool is needed, call it now. "
        "Otherwise provide the final answer to the user."
    )


def execute_single_direct_tool_call(
    *,
    tool_call: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    index: int = 1,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
    callbacks: DirectToolExecutionCallbacks,
) -> str:
    return skills_service.execute_single_direct_tool_call(
        tool_call=tool_call,
        workspace_id=workspace_id,
        thread_id=thread_id,
        index=index,
        provider=provider,
        model=model,
        credentials=credentials,
        reasoning_effort=reasoning_effort,
        session_ctx=session_ctx,
        callbacks=callbacks,
    )


def execute_direct_tool_calls(
    *,
    tool_calls: List[Dict[str, Any]],
    workspace_id: str,
    thread_id: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
    execute_single_tool_call: Callable[..., str],
) -> str:
    if not tool_calls:
        return ""
    replies: List[str] = []
    for index, call in enumerate(tool_calls, start=1):
        replies.append(
            execute_single_tool_call(
                tool_call=call,
                workspace_id=workspace_id,
                thread_id=thread_id,
                index=index,
                provider=provider,
                model=model,
                credentials=credentials,
                reasoning_effort=reasoning_effort,
                session_ctx=session_ctx,
            )
        )
    return "\n\n".join(part for part in replies if part).strip()
