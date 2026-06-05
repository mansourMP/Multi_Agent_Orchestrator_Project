from __future__ import annotations

import ast
from dataclasses import dataclass
import json
import re
from pathlib import Path
from typing import Any, Callable, Dict

from server_modules import direct_chat_tool_catalog_service
from server_modules.direct_chat_intervention_service import build_intervention


def count_python_definition_lines(source_text: str, kind: str) -> int:
    if kind == "class":
        pattern = r"^\s*class\s+"
    else:
        pattern = r"^\s*(?:async\s+def|def)\s+"
    return sum(1 for line in str(source_text or "").splitlines() if re.search(pattern, line))


def count_definitions_in_file(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    extract_first_path_reference: Callable[[str], str],
    resolve_local_path: Callable[[str], Path],
) -> str | None:
    compact = compact_text(message)
    if "count" not in compact and "how many" not in compact:
        return None
    path = extract_first_path_reference(message)
    if not path:
        return None
    wants_functions = "function" in compact
    wants_classes = "class" in compact
    if not wants_functions and not wants_classes:
        return None
    target = resolve_local_path(path)
    if not target.exists() or not target.is_file():
        raise RuntimeError(f"File not found: {target}")
    source_text = target.read_text(encoding="utf-8")
    counts: list[str] = []
    if wants_functions:
        function_count = count_python_definition_lines(source_text, "function")
        counts.append(f"{function_count} functions")
    if wants_classes:
        class_count = count_python_definition_lines(source_text, "class")
        counts.append(f"{class_count} classes")
    if not counts:
        return None
    if len(counts) == 1:
        return f"{target} defines {counts[0]}."
    return f"{target} defines {counts[0]} and {counts[1]}."


class NoProviderRustGateError(RuntimeError):
    pass


def _enforce_no_provider_summary_write(
    *,
    source_dir: Path,
    output_path: Path,
    python_file_count: int,
    total_functions: int,
    parse_failure_count: int,
    summary_bytes: int,
) -> None:
    from server_modules import rust_runtime_kernel_client

    payload = {
        "source_dir": str(source_dir),
        "output_path": str(output_path),
        "python_file_count": max(0, int(python_file_count or 0)),
        "total_functions": max(0, int(total_functions or 0)),
        "parse_failure_count": max(0, int(parse_failure_count or 0)),
        "summary_bytes": max(0, int(summary_bytes or 0)),
    }
    try:
        decision = rust_runtime_kernel_client.runtime_state_store_decision(
            operation="write_no_provider_summary",
            state_class="no_provider_summaries",
            actor_id="system",
            status="active",
            payload=payload,
            payload_bytes=int(payload["summary_bytes"]),
            workspace_access=True,
            owner_access=True,
        )
        rust_runtime_kernel_client.enforce_kernel_decision(
            "runtime-state-store-decision",
            decision,
        )
        next_action = str(decision.get("next_action") or "").strip()
        if next_action != "write_no_provider_summary":
            raise NoProviderRustGateError("unexpected_next_action")
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        raise NoProviderRustGateError(exc.reason) from exc


def count_functions_and_write_summary(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    resolve_local_path: Callable[[str], Path],
) -> str | None:
    compact = compact_text(message)
    if ".py" not in compact or "function" not in compact or "count" not in compact:
        return None
    directory_match = re.search(r"\.py files in\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    output_match = re.search(r"\bwrite(?:\s+\w+){0,4}\s+to\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    if not directory_match or not output_match:
        return None
    source_dir = resolve_local_path(str(directory_match.group(1) or "").strip())
    output_path = resolve_local_path(str(output_match.group(1) or "").strip())
    if not source_dir.exists() or not source_dir.is_dir():
        raise RuntimeError(f"Directory not found: {source_dir}")

    python_files = sorted(source_dir.rglob("*.py"))
    total_functions = 0
    parse_failures: list[str] = []
    per_file_counts: list[tuple[str, int]] = []
    for path in python_files:
        try:
            source_text = path.read_text(encoding="utf-8")
            tree = ast.parse(source_text, filename=str(path))
            function_count = sum(
                1 for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            )
        except Exception:
            parse_failures.append(str(path.relative_to(source_dir)))
            function_count = 0
        total_functions += function_count
        per_file_counts.append((str(path.relative_to(source_dir)), function_count))

    summary_lines = [
        f"Directory: {source_dir}",
        f"Python files scanned: {len(python_files)}",
        f"Functions found: {total_functions}",
    ]
    if parse_failures:
        summary_lines.append(f"Parse failures: {len(parse_failures)}")
    summary_lines.append("")
    summary_lines.append("Per-file counts:")
    for relative_path, function_count in per_file_counts:
        summary_lines.append(f"- {relative_path}: {function_count}")
    if parse_failures:
        summary_lines.append("")
        summary_lines.append("Files with parse failures:")
        for relative_path in parse_failures:
            summary_lines.append(f"- {relative_path}")
    summary_text = "\n".join(summary_lines).strip()
    _enforce_no_provider_summary_write(
        source_dir=source_dir,
        output_path=output_path,
        python_file_count=len(python_files),
        total_functions=total_functions,
        parse_failure_count=len(parse_failures),
        summary_bytes=len((summary_text + "\n").encode("utf-8")),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(summary_text + "\n", encoding="utf-8")
    return (
        f"Counted {total_functions} functions across {len(python_files)} Python files in {source_dir}. "
        f"Wrote the summary to {output_path}."
    )


def list_directory(
    message: str,
    *,
    safe_positive_int: Callable[[Any, int], int],
    resolve_local_path: Callable[[str], Path],
) -> Dict[str, str] | None:
    if not looks_like_directory_listing_request(message):
        return None
    list_match = re.search(
        r"\blist(?:\s+the)?(?:\s+first\s+(\d+))?\s+files?\s+in\s+([^\s,;:()]+)",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    desktop_match = re.search(
        r"\blist(?:\s+the)?(?:\s+first\s+(\d+))?\s+files?\s+(?:on|in|from)\s+(?:my|the)\s+desktop\b",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    if list_match:
        requested_limit = safe_positive_int(list_match.group(1), default=0)
        directory = resolve_local_path(str(list_match.group(2) or "").strip())
    elif desktop_match:
        requested_limit = safe_positive_int(desktop_match.group(1), default=0)
        directory = Path.home() / "Desktop"
    else:
        return None
    if not directory.exists() or not directory.is_dir():
        raise RuntimeError(f"Directory not found: {directory}")
    entries = sorted(path.name for path in directory.iterdir())
    if requested_limit > 0:
        entries = entries[:requested_limit]
    listing = "\n".join(entries) if entries else "(empty)"
    return {
        "directory": str(directory),
        "listing": listing,
        "limit": requested_limit if requested_limit > 0 else None,
    }


def looks_like_directory_listing_request(message: str) -> bool:
    return bool(
        re.search(
            r"\blist(?:\s+the)?(?:\s+first\s+\d+)?\s+files?\s+(?:in\s+[^\s,;:()]+|(?:on|in|from)\s+(?:my|the)\s+desktop)\b",
            str(message or ""),
            flags=re.IGNORECASE,
        )
    )


def _path_inspection_requested(compact: str, path: str) -> bool:
    normalized_path = str(path or "").strip().lower()
    if not normalized_path:
        return False
    if compact == normalized_path:
        return True
    return any(token in compact for token in ("read", "open", "show", "see", "inspect", "check", "what's in", "whats in", "count", "how many"))


def extract_shell_command(
    message: str,
    *,
    compact_text: Callable[[Any], str],
    extract_first_url: Callable[[str], str],
) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"run\s+this\s+shell\s+command:\s*(.+)$",
        r"run\s+this\s+command:\s*(.+)$",
        r"execute\s+this\s+shell\s+command:\s*(.+)$",
        r"execute\s+this\s+command:\s*(.+)$",
        r"shell:\s*(.+)$",
        r"run:\s*(.+)$",
        r"execute:\s*(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().strip("`")
    backtick_match = re.search(r"`([^`]+)`", text)
    compact = compact_text(text)
    if backtick_match and any(token in compact for token in ("run", "execute", "shell", "command")):
        return str(backtick_match.group(1) or "").strip()
    for opener in ("run ", "execute "):
        if compact.startswith(opener):
            candidate = text[len(opener):].strip()
            if candidate and not extract_first_url(candidate):
                return candidate.strip("`")
    return ""


def extract_web_query(message: str) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"search\s+for\s+(.+)$",
        r"look\s+up\s+(.+)$",
        r"find\s+(.+?)\s+on\s+the\s+web$",
        r"what\s+is\s+(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().rstrip("?.!")
    return ""


LOCAL_SYSTEM_INFO_SHELL_COMMAND = (
    'printf "===OS===\\n"; '
    '(sw_vers 2>/dev/null || uname -a); '
    'printf "\\n===CPU===\\n"; '
    '(sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m); '
    'printf "\\n===RAM_BYTES===\\n"; '
    '(sysctl -n hw.memsize 2>/dev/null || true); '
    'printf "\\n===CORES===\\n"; '
    '(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || true); '
    'printf "\\n===DISK===\\n"; '
    '(df -h / 2>/dev/null || true)'
)


def local_system_info_shell_command() -> str:
    return LOCAL_SYSTEM_INFO_SHELL_COMMAND


def local_working_directory_shell_command() -> str:
    return "pwd"


def parse_http_tool_output(output: str) -> Any:
    parts = str(output or "").split("\n\n", 1)
    payload = parts[1] if len(parts) > 1 else ""
    if not payload:
        return None
    try:
        return json.loads(payload)
    except Exception:
        return payload.strip()


def no_provider_reasoning_required_response() -> Dict[str, Any]:
    return {
        "reply": "",
        "actions": [],
        "mode": "answer",
        "error": "model_provider_unavailable",
        "interventions": [
            build_intervention(
                "model_provider_unavailable",
                "Selected model unavailable",
                detail="The selected model cannot answer because its provider is not configured for this workspace.",
                severity="warning",
                status="failed",
                code="model_provider_unavailable",
            )
        ],
    }


@dataclass(slots=True)
class NoProviderExecutionServices:
    compact_text: Callable[[Any], str]
    safe_positive_int: Callable[[Any, int], int]
    resolve_local_path: Callable[[str], Path]
    extract_first_path_reference: Callable[[str], str]
    extract_first_url: Callable[[str], str]
    parse_page_state: Callable[[str], Any]
    parse_memory_write: Callable[[str], dict[str, str] | None]
    parse_memory_read: Callable[[str], str | None]
    handle_memory_request: Callable[[str, str], str | None]
    parse_tool_name: Callable[[str], tuple[str, str]]
    tool_arguments_payload: Callable[[Any], Dict[str, Any]]
    approval_required_for_tool: Callable[[str, str, Dict[str, Any], list[dict[str, Any]]], bool]
    agent_machine_full_trust_for_session: Callable[[dict[str, Any] | None], bool]
    execute_single_tool_call: Callable[..., str]


def _humanize_approval_token(value: str) -> str:
    token = str(value or "").strip().replace("__", " ").replace("_", " ").replace("-", " ")
    token = re.sub(r"\s+", " ", token).strip()
    return " ".join(part.capitalize() for part in token.split(" ") if part)


def _approval_prompt(connector_id: str, action_id: str) -> str:
    connector_label = _humanize_approval_token(connector_id) or "Tool"
    action_label = _humanize_approval_token(action_id) or "action"
    return f"Approve {connector_label} to {action_label.lower()} before continuing."


def _tool_call_is_screenshot_capture(connector_id: str, action_id: str, arguments: Dict[str, Any]) -> bool:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    if normalized_connector == "screenshot" and normalized_action == "capture":
        return True
    if normalized_connector != "hardware":
        return False
    capability = str(
        arguments.get("capability_id")
        or arguments.get("action")
        or arguments.get("tool")
        or ""
    ).strip().lower()
    return capability in {"screenshot.capture", "screen.capture", "capture_screenshot", "screenshot"}


def _current_turn_requested_screenshot(session_ctx: dict[str, Any] | None, *, compact_text: Callable[[Any], str]) -> bool:
    if not isinstance(session_ctx, dict):
        return False
    candidates: list[str] = []
    for key in ("user_message", "message", "prompt", "normalized_message"):
        value = session_ctx.get(key)
        if isinstance(value, str) and value.strip():
            candidates.append(value)
    metadata = session_ctx.get("metadata") if isinstance(session_ctx.get("metadata"), dict) else {}
    for key in ("user_message", "message", "prompt", "normalized_message"):
        value = metadata.get(key) if isinstance(metadata, dict) else None
        if isinstance(value, str) and value.strip():
            candidates.append(value)
    compact = compact_text(" ".join(candidates))
    if not compact:
        return False
    return bool(
        re.search(
            r"\b(?:take\s+(?:a\s+)?screenshot|screenshot|screen\s+shot|capture\s+(?:my\s+|the\s+)?screen|screen\s+capture)\b",
            compact,
            flags=re.IGNORECASE,
        )
    )


def _message_requests_screenshot(compact: str) -> bool:
    return bool(
        re.search(
            r"\b(?:take\s+(?:a\s+)?screenshot|screenshot|screen\s+shot|capture\s+(?:my\s+|the\s+)?screen|screen\s+capture)\b",
            str(compact or ""),
            flags=re.IGNORECASE,
        )
    )


def build_direct_tool_approval_response(
    *,
    tool_calls: list[dict[str, Any]],
    tool_capabilities: list[dict[str, Any]],
    services: NoProviderExecutionServices,
    session_ctx: dict[str, Any] | None = None,
) -> Dict[str, Any] | None:
    approval_actions: list[dict[str, Any]] = []
    approvals: list[dict[str, Any]] = []
    for index, call in enumerate(tool_calls, start=1):
        connector_id, action_id = services.parse_tool_name(str(call.get("name") or ""))
        argument_payload = services.tool_arguments_payload(call.get("arguments"))
        requires_approval = services.approval_required_for_tool(connector_id, action_id, argument_payload, tool_capabilities)
        if (
            requires_approval
            and _tool_call_is_screenshot_capture(connector_id, action_id, argument_payload)
            and _current_turn_requested_screenshot(session_ctx, compact_text=services.compact_text)
        ):
            requires_approval = False
        if not requires_approval:
            continue
        tool_input = str(argument_payload.get("input") or "").strip()
        if connector_id in {"file", "shell", "screenshot", "http", "browser", "computer", "hardware"}:
            tool_input = json.dumps(argument_payload, ensure_ascii=False)
        approval_actions.append(
            {
                "type": "approval_required",
                "connector": connector_id,
                "action": action_id,
                "input": tool_input,
                "id": f"approval_required:{connector_id}:{action_id}:{index}",
                "kind": "approval_required",
                "label": "Confirm",
                "variant": "primary",
            }
        )
        approvals.append(
            {
                "prompt": _approval_prompt(connector_id, action_id),
                "labels": [f"{connector_id}.{action_id}"],
                "capabilities": [connector_id] if connector_id else [],
                "actions": [action_id] if action_id else [],
                "target": None,
                "scope": "once",
                "reusable": False,
                "consequence": None,
                "status": "waiting",
            }
        )
    if not approval_actions:
        return None
    return {
        "reply": "",
        "actions": approval_actions,
        "approvals": approvals,
        "mode": "answer_with_action",
    }


def plan_tool_calls(
    message: str,
    tools: list[dict[str, Any]],
    *,
    compact_text: Callable[[Any], str],
    extract_first_path_reference: Callable[[str], str],
    extract_first_url: Callable[[str], str],
) -> list[dict[str, Any]]:
    compact = compact_text(message)
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    planned: list[dict[str, Any]] = []
    path = extract_first_path_reference(message)
    file_requested = bool(path and _path_inspection_requested(compact, path))
    if file_requested and "file__read" in tool_names:
        planned.append({"name": "file__read", "arguments": {"path": path}})
    elif file_requested and "hardware__action" in tool_names:
        planned.append(
            {
                "name": "hardware__action",
                "arguments": {
                    "runtime_target": "user_device_gateway",
                    "action": "file.read",
                    "arguments": {"path": path},
                },
            }
        )

    url = "" if file_requested else extract_first_url(message)
    browser_requested = bool(
        url and any(token in compact for token in ("go to", "open", "visit", "what's on", "whats on", "page title", "main heading", "browser"))
    )
    if url and "http_request" in tool_names and not browser_requested:
        planned.append({"name": "http_request", "arguments": {"method": "GET", "url": url}})
    if url and "browser__navigate" in tool_names and browser_requested:
        planned.append({"name": "browser__navigate", "arguments": {"url": url}})
        if "browser__observe" in tool_names:
            planned.append({"name": "browser__observe", "arguments": {}})
        elif "browser__get_page_state" in tool_names:
            planned.append({"name": "browser__get_page_state", "arguments": {}})
        if "heading" in compact and "browser__extract_text" in tool_names:
            planned.append({"name": "browser__extract_text", "arguments": {"selector": "h1"}})
    if _message_requests_screenshot(compact) and "screenshot__capture" in tool_names:
        planned.append({"name": "screenshot__capture", "arguments": {}})
    elif _message_requests_screenshot(compact) and "hardware__action" in tool_names:
        planned.append(
            {
                "name": "hardware__action",
                "arguments": {
                    "runtime_target": "user_device_gateway",
                    "action": "screenshot.capture",
                    "arguments": {},
                },
            }
        )
    shell_command = extract_shell_command(
        message,
        compact_text=compact_text,
        extract_first_url=extract_first_url,
    )
    if shell_command and "shell__exec" in tool_names:
        planned.append({"name": "shell__exec", "arguments": {"command": shell_command}})
    elif shell_command and "hardware__action" in tool_names:
        planned.append(
            {
                "name": "hardware__action",
                "arguments": {
                    "runtime_target": "user_device_gateway",
                    "action": "shell.execute",
                    "arguments": {"command": shell_command},
                },
            }
        )
    working_directory_requested = direct_chat_tool_catalog_service.looks_like_local_working_directory_request(compact)
    if working_directory_requested and not planned and "shell__exec" in tool_names:
        planned.append({"name": "shell__exec", "arguments": {"command": local_working_directory_shell_command()}})
    elif working_directory_requested and not planned and "hardware__action" in tool_names:
        planned.append(
            {
                "name": "hardware__action",
                "arguments": {
                    "runtime_target": "user_device_gateway",
                    "action": "shell.execute",
                    "arguments": {"command": local_working_directory_shell_command()},
                },
            }
        )
    system_info_requested = direct_chat_tool_catalog_service.looks_like_local_system_info_request(compact)
    if system_info_requested and not planned and "computer__system_info" in tool_names:
        planned.append({"name": "computer__system_info", "arguments": {}})
    elif system_info_requested and not planned and "shell__exec" in tool_names:
        planned.append({"name": "shell__exec", "arguments": {"command": local_system_info_shell_command()}})
    elif system_info_requested and not planned and "hardware__action" in tool_names:
        planned.append(
            {
                "name": "hardware__action",
                "arguments": {
                    "runtime_target": "user_device_gateway",
                    "action": "shell.execute",
                    "arguments": {"command": local_system_info_shell_command()},
                },
            }
        )
    web_query = extract_web_query(message)
    if web_query and "web__search" in tool_names and not url:
        planned.append({"name": "web__search", "arguments": {"query": web_query}})
    return planned


def has_obvious_direct_tool_intent(
    message: str,
    tools: list[dict[str, Any]],
    *,
    compact_text: Callable[[Any], str],
    extract_first_path_reference: Callable[[str], str],
    extract_first_url: Callable[[str], str],
    parse_memory_write: Callable[[str], dict[str, str] | None],
    parse_memory_read: Callable[[str], str | None],
) -> bool:
    compact = compact_text(message)
    if not compact:
        return False
    if direct_chat_tool_catalog_service.should_skip_local_tool_prefetch(message, compact):
        return False
    if (
        any(marker in compact for marker in (" then ", " after that ", " next step", " next steps"))
        and any(token in compact for token in ("inspect", "prepare", "review", "analy", "summarize", "plan"))
    ):
        return False
    path = extract_first_path_reference(message)
    if path and _path_inspection_requested(compact, path):
        return True
    if looks_like_directory_listing_request(message):
        return True
    if extract_shell_command(
        message,
        compact_text=compact_text,
        extract_first_url=extract_first_url,
    ):
        return True
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    hardware_tool_available = "hardware__action" in tool_names
    screenshot_tool_available = hardware_tool_available or "screenshot__capture" in tool_names
    computer_tool_available = hardware_tool_available or any(name.startswith("computer__") for name in tool_names)
    if screenshot_tool_available and _message_requests_screenshot(compact):
        return True
    if computer_tool_available and bool(
        re.search(
            r"\b(?:read\s+(?:my\s+|the\s+)?screen|screen\s+text|ocr|click\s+(?:at\s+|on\s+|the\s+screen)|type\s+text|paste\s+this|copy\s+to\s+clipboard|read\s+clipboard)\b",
            compact,
            flags=re.IGNORECASE,
        )
    ):
        return True
    if direct_chat_tool_catalog_service.looks_like_local_system_info_request(compact) and (
        "computer__system_info" in tool_names or "shell__exec" in tool_names or "hardware__action" in tool_names
    ):
        return True
    if direct_chat_tool_catalog_service.looks_like_local_working_directory_request(compact) and (
        "shell__exec" in tool_names or "hardware__action" in tool_names
    ):
        return True
    if parse_memory_write(message) is not None or parse_memory_read(message) is not None:
        return True
    if extract_web_query(message):
        return True
    url = extract_first_url(message)
    if not url:
        return False
    if any(token in compact for token in ("go to", "open", "visit", "what's on", "whats on", "page title", "main heading", "browser")):
        return True
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    return "http_request" in tool_names
