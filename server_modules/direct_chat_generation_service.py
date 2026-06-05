from __future__ import annotations

from dataclasses import dataclass
import html
import json
import re
import time
from typing import Any, Callable, Dict, Iterator, List, Optional
import uuid

from server_modules import agent_trace_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_tool_execution_service
from server_modules import empyralis_model_tier_contract
from server_modules import empyralis_model_tier_routing_service
from server_modules import healthguide_safety_service
from server_modules import response_leak_guard_service
from server_modules import secret_redaction_service
from server_modules.direct_chat_context_service import is_public_generation_error_message
from server_modules.direct_chat_intervention_service import build_intervention
from server_modules.direct_tool_config_service import run_async_tool_call
from server_modules.plugin_system import (
    HookContext,
    HookResult,
    HOOK_AGENT_START,
    HOOK_AGENT_END,
    HOOK_LLM_INPUT,
    HOOK_LLM_OUTPUT,
    HOOK_TOOL_CALL,
    HOOK_TOOL_RESULT,
    get_global_hook_registry,
)


@dataclass(slots=True)
class DirectChatGenerationServices:
    thinking_step_payload: Callable[[int, str, Optional[str]], Dict[str, Any]]
    build_context_used: Callable[..., Dict[str, Any]]
    build_direct_tool_approval_response: Callable[..., Optional[Dict[str, Any]]]
    parse_tool_name: Callable[[str], tuple[str, str]]
    tool_arguments_payload: Callable[[Any], Dict[str, Any]]
    parse_page_state: Callable[[str], Any]
    direct_tool_step_payload: Callable[..., Dict[str, Any]]
    execute_single_direct_tool_call: Callable[..., str]
    direct_tool_followup_message: Callable[[str, str], str]
    suggest_actions: Callable[[str, Dict[str, Any]], List[Dict[str, Any]]]
    clear_direct_tool_loop_state: Callable[[str], None]
    persist_direct_chat_memory_best_effort: Callable[..., None]
    persist_direct_chat_transcript_best_effort: Callable[..., None]
    persist_direct_chat_hosted_usage_best_effort: Callable[..., None]
    record_direct_tool_signature: Callable[[str, Dict[str, Any]], bool]
    direct_chat_error_reply: Callable[[str], str]
    capture_exception: Callable[[BaseException], None]
    generate_chat_reply_stream_with_provider_fallback: Callable[..., Iterator[Dict[str, Any]]]


def _compact_trace_text(value: Any, limit: int = 280) -> str:
    text = " ".join(str(value or "").split()).strip()
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 1)].rstrip()}…"


_ASSISTANT_SHELL_PLAN_RE = re.compile(
    r"```(?:bash|sh|shell|zsh)?\s*\n(.*?)```",
    re.I | re.S,
)
_ASSISTANT_INLINE_SHELL_PLAN_RE = re.compile(
    r"`([^`\n]*(?:&&|\|\||\||2>/dev/null|/Applications|/etc/os-release|uname\b|sw_vers\b|sysctl\b|brew\b|df\b|whoami\b|pwd\b|ls\b)[^`\n]*)`",
    re.I,
)
_ASSISTANT_SHELL_LINE_RE = re.compile(
    r"^(?:#|\$|(?:sudo\s+)?(?:bash|sh|zsh|pwd|whoami|uname|sw_vers|sysctl|df|du|ls|brew|cat|echo|find|mdfind|system_profiler|ioreg|ps|pgrep|osascript|open|systeminfo|wmic|powershell)\b)",
    re.I,
)
_ASSISTANT_SHELL_LINE_HINT_RE = re.compile(
    r"(?:&&|\|\||\||2>/dev/null|/Applications|/etc/os-release|hw\.memsize|brew\s+list|sw_vers|systeminfo)",
    re.I,
)
_ASSISTANT_LABELED_SHELL_COMMAND_RE = re.compile(
    r"^\s*(?:run[_\s-]?command|shell[_\s-]?command)\s*:\s*(?P<command>.+?)\s*$",
    re.I,
)
_ASSISTANT_SHELL_PLAN_MARKERS = (
    "running the command",
    "running the commands",
    "running a command",
    "run the command",
    "run the commands",
    "run these commands",
    "run the following commands",
    "run_command:",
    "run command:",
    "shell_command:",
    "shell command:",
    "let me check",
    "let me get",
    "let me run",
    "let me re-run",
    "let me rerun",
    "let me see what",
    "re-run them",
    "rerun them",
    "commands ran",
    "output didn't come through",
    "output did not come through",
    "show you the results directly",
    "i'll grab",
    "i will grab",
)

_EXTERNAL_ACTION_OBJECT_RE = re.compile(
    r"\b(?:screenshot|screen\s+capture|screen|shell|command|file|mouse|keyboard|click|type|window|app|computer)\b",
    re.I,
)
_EXTERNAL_ACTION_SUCCESS_RE = re.compile(
    r"\b(?:captured|completed|done|success(?:ful|fully)?|finished|executed|ran|created|opened|clicked|typed|wrote|read|controlled|took)\b",
    re.I,
)
_EXTERNAL_ACTION_ACTIVE_RE = re.compile(
    r"\b(?:i(?:'|’)?m|i\s+am|i(?:'|’)?ll|i\s+will|i\s+have|i(?:'|’)?ve|let\s+me|the)\b.{0,120}"
    r"\b(?:taking|captur(?:ing|ed)|running|executing|check(?:ing)?|inspect(?:ing)?|retriev(?:ing|e)|clicking|typing|writing|reading|opening|controlling|use|using|calling|fetching|getting|send(?:ing)?|submitting|requesting)\b",
    re.I | re.S,
)
_DIRECT_TOOL_FAILURE_CLAIM_RE = re.compile(
    r"\b(?:failed|failure|didn(?:'|’)?t|couldn(?:'|’)?t|cannot|can't|can(?:not|'t)|not\s+connected|"
    r"isn(?:'|’)?t\s+connected|not\s+responding|unavailable|offline|no\s+luck|timed\s+out)\b",
    re.I,
)


def _contains_unverified_external_action_claim(value: Any) -> bool:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        return False
    if not _EXTERNAL_ACTION_OBJECT_RE.search(text):
        return False
    return bool(_EXTERNAL_ACTION_SUCCESS_RE.search(text) or _EXTERNAL_ACTION_ACTIVE_RE.search(text))


def _direct_tool_result_status(result_text: Any) -> str:
    try:
        payload = json.loads(str(result_text or "").strip())
    except Exception:
        payload = {}
    if isinstance(payload, dict):
        result_payload = payload.get("result") if isinstance(payload.get("result"), dict) else {}
        if (
            isinstance(result_payload.get("images"), list)
            and result_payload.get("images")
        ) or int(result_payload.get("image_count") or 0) > 0:
            return "completed"
        status = str(payload.get("status") or "").strip().lower()
        if not status and result_payload:
            status = str(result_payload.get("status") or "").strip().lower()
        if not status and payload.get("success") is True:
            status = "completed"
        if status:
            return status
    return "completed" if str(result_text or "").strip() else "unknown"


def _direct_tool_authoritative_result_message(
    *,
    tool_name: str,
    result_text: Any,
    trace_metadata: Dict[str, Any],
) -> str:
    status = _direct_tool_result_status(result_text)
    summary = _compact_trace_text(
        str((trace_metadata or {}).get("result_summary") or result_text or "").strip()
    )
    artifact_ids: List[str] = []
    screenshot_payload = (trace_metadata or {}).get("browser_screenshot")
    if isinstance(screenshot_payload, dict):
        artifact_id = str(screenshot_payload.get("artifact_id") or "").strip()
        if artifact_id:
            artifact_ids.append(artifact_id)
    lines = [
        "Authoritative action outcome for answering the user.",
        f"Action name: {str(tool_name or 'direct_tool').strip() or 'direct_tool'}",
        f"Outcome: {status}",
    ]
    if summary:
        lines.append(f"Result summary: {summary}")
    if artifact_ids:
        lines.append(f"Attached artifact IDs: {', '.join(artifact_ids)}")
        if status == "completed":
            lines.append("If the user asked for a screenshot or visual proof, the attached artifact is the captured result.")
    lines.append("Answer naturally in your own words. Do not expose tool JSON, command syntax, or internal trace text.")
    lines.append("Do not report this action as failed unless the outcome above is failed, error, denied, or offline.")
    return "\n".join(lines)


def _direct_tool_result_record(
    *,
    tool_name: str,
    result_text: Any,
    trace_metadata: Dict[str, Any],
) -> Dict[str, str]:
    status = _direct_tool_result_status(result_text)
    screenshot_payload = (trace_metadata or {}).get("browser_screenshot")
    if isinstance(screenshot_payload, dict) and str(screenshot_payload.get("artifact_id") or "").strip():
        status = "completed"
    summary = _compact_trace_text(str((trace_metadata or {}).get("result_summary") or result_text or "").strip())
    try:
        payload = json.loads(str(result_text or "").strip())
    except Exception:
        payload = {}
    result_payload = payload.get("result") if isinstance(payload, dict) and isinstance(payload.get("result"), dict) else {}
    if (
        isinstance(result_payload.get("images"), list)
        and result_payload.get("images")
    ) or int(result_payload.get("image_count") or 0) > 0:
        summary = str(result_payload.get("summary") or "").strip() or "Captured screenshot from Agent Computer."
    return {
        "tool": str(tool_name or "direct_tool").strip() or "direct_tool",
        "status": status,
        "summary": summary,
    }


def _direct_tool_user_facing_label(tool_name: str, connector_id: str, action_id: str) -> str:
    normalized_tool = " ".join(str(tool_name or "").replace("_", " ").replace("-", " ").split()).lower()
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    if (
        normalized_connector == "computer"
        and normalized_action == "system_info"
    ) or (
        "computer" in normalized_tool and "system" in normalized_tool and "info" in normalized_tool
    ):
        return "computer info"
    if normalized_connector == "screenshot" or "screenshot" in normalized_tool:
        return "screenshot"
    if normalized_connector == "file" or normalized_tool.startswith("file "):
        return "file"
    return str(tool_name or "tool").strip() or "tool"


_DSML_PIPE_RE = r"[\|｜]"
_DSML_PREFIX_RE = r"<\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*DSML\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*"
_DSML_TOOL_BLOCK_RE = re.compile(
    _DSML_PREFIX_RE + r"tool_calls\s*>.*",
    re.IGNORECASE | re.DOTALL,
)
_DSML_INVOKE_RE = re.compile(
    _DSML_PREFIX_RE
    + r"invoke\s+name=[\"']([^\"']+)[\"']\s*>(.*?)"
    + r"<\s*/\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*DSML\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*invoke\s*>",
    re.IGNORECASE | re.DOTALL,
)
_DSML_PARAMETER_RE = re.compile(
    _DSML_PREFIX_RE
    + r"parameter\s+name=[\"']([^\"']+)[\"'][^>]*>(.*?)"
    + r"<\s*/\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*DSML\s*" + _DSML_PIPE_RE + r"\s*" + _DSML_PIPE_RE + r"\s*parameter\s*>",
    re.IGNORECASE | re.DOTALL,
)
_INLINE_FUNCTION_TOOL_RE = re.compile(
    r"<\s*function\s*>\s*([a-zA-Z0-9_.:-]+)\s*<\s*/\s*function\s*>",
    re.IGNORECASE,
)
_ASSISTANT_JSON_FENCE_RE = re.compile(
    r"```(?:json)?\s*\n?(.*?)```",
    re.IGNORECASE | re.DOTALL,
)

_ASSISTANT_ACTION_TOOL_ALIASES = {
    "bash": "shell__exec",
    "capture_screenshot": "screenshot__capture",
    "command": "shell__exec",
    "screen": "screenshot__capture",
    "screen.capture": "screenshot__capture",
    "screen_capture": "screenshot__capture",
    "screenshot": "screenshot__capture",
    "screenshot.capture": "screenshot__capture",
    "shell": "shell__exec",
    "sh": "shell__exec",
    "take_screenshot": "screenshot__capture",
    "terminal": "shell__exec",
    "run_command": "shell__exec",
    "zsh": "shell__exec",
}


def _looks_like_dsml_tool_markup(value: Any) -> bool:
    text = str(value or "")
    return bool(
        re.search(_DSML_PREFIX_RE, text, flags=re.IGNORECASE)
        or _INLINE_FUNCTION_TOOL_RE.search(text)
    )


def _looks_like_assistant_json_action_markup(value: Any) -> bool:
    text = str(value or "")
    if not text:
        return False
    lowered = text.lower()
    if "```json" in lowered:
        return True
    stripped = text.strip()
    if stripped.startswith(("{", "[")) and any(token in lowered for token in ('"action"', '"tool"', '"tool_name"', '"capability"')):
        return True
    return False


def _looks_like_assistant_shell_plan_markup(value: Any) -> bool:
    text = str(value or "")
    if not text:
        return False
    if _ASSISTANT_LABELED_SHELL_COMMAND_RE.search(text):
        return True
    for raw_line in text.splitlines():
        if _looks_like_assistant_shell_line(_normalize_assistant_shell_line(raw_line)):
            return True
    return any(marker in " ".join(text.lower().split()) for marker in _ASSISTANT_SHELL_PLAN_MARKERS)


def _strip_assistant_pseudo_tool_lines(value: Any) -> str:
    raw_text = str(value or "")
    had_pseudo_tool_line = bool(_ASSISTANT_LABELED_SHELL_COMMAND_RE.search(raw_text))
    lines: List[str] = []
    for raw_line in raw_text.splitlines():
        if _ASSISTANT_LABELED_SHELL_COMMAND_RE.match(raw_line):
            continue
        lines.append(raw_line)
    cleaned = "\n".join(lines).strip()
    if had_pseudo_tool_line and _looks_like_assistant_action_plan_preamble(cleaned):
        return ""
    return cleaned


def _looks_like_assistant_action_plan_preamble(value: Any) -> bool:
    text = " ".join(str(value or "").strip().lower().replace("’", "'").replace("`", "'").split())
    if not text:
        return True
    if len(text) > 320:
        return False
    plan_markers = (
        "i'll check",
        "i will check",
        "i'll run",
        "i will run",
        "i'll retrieve",
        "i will retrieve",
        "running a command",
        "running the command",
        "run a command",
        "retrieve the details",
        "retrieve details",
        "hardware information",
        "checking your system",
        "checking the system",
        "need to run",
        "approve?",
    )
    result_markers = (
        "the result is",
        "here is",
        "here are",
        "i found",
        "completed",
        "captured",
        "output",
    )
    return any(marker in text for marker in plan_markers) and not any(marker in text for marker in result_markers)


def _normalize_dsml_tool_name(name: str) -> str:
    normalized = str(name or "").strip().lower().replace("-", "_")
    aliases = {
        "bash": "shell__exec",
        "sh": "shell__exec",
        "shell": "shell__exec",
        "terminal": "shell__exec",
        "zsh": "shell__exec",
        "screenshot": "screenshot__capture",
        "screen_capture": "screenshot__capture",
        "capture_screenshot": "screenshot__capture",
    }
    return aliases.get(normalized, normalized)


def _extract_dsml_tool_calls_from_text(value: Any) -> tuple[str, List[Dict[str, Any]]]:
    raw = str(value or "")
    if not raw or not (_DSML_TOOL_BLOCK_RE.search(raw) or _INLINE_FUNCTION_TOOL_RE.search(raw)):
        return raw, []

    tool_calls: List[Dict[str, Any]] = []
    for invoke_match in _DSML_INVOKE_RE.finditer(raw):
        tool_name = _normalize_dsml_tool_name(invoke_match.group(1))
        if not tool_name:
            continue
        body = invoke_match.group(2) or ""
        parameters: Dict[str, str] = {}
        for parameter_match in _DSML_PARAMETER_RE.finditer(body):
            parameter_name = str(parameter_match.group(1) or "").strip()
            if not parameter_name:
                continue
            parameters[parameter_name] = html.unescape(str(parameter_match.group(2) or "")).strip()
        arguments: Dict[str, Any] = {}
        if tool_name == "shell__exec":
            command = parameters.get("command") or parameters.get("cmd") or parameters.get("input") or ""
            if not command:
                continue
            arguments["command"] = command
            description = parameters.get("description")
            if description:
                arguments["description"] = description
        else:
            arguments = dict(parameters)
        tool_calls.append({"name": tool_name, "arguments": arguments})

    cleaned = _DSML_TOOL_BLOCK_RE.sub("", raw).strip()
    for function_match in _INLINE_FUNCTION_TOOL_RE.finditer(raw):
        tool_name = _normalize_dsml_tool_name(function_match.group(1))
        if tool_name:
            tool_calls.append({"name": tool_name, "arguments": {}})
    cleaned = _INLINE_FUNCTION_TOOL_RE.sub("", cleaned).strip()
    return cleaned, tool_calls


def _assistant_plan_tool_names(tools: List[Dict[str, Any]]) -> set[str]:
    return {
        str(item.get("name") or "").strip()
        for item in tools
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    }


def _normalize_assistant_json_tool_name(value: Any) -> str:
    normalized = str(value or "").strip().lower().replace("-", "_")
    if not normalized:
        return ""
    return _ASSISTANT_ACTION_TOOL_ALIASES.get(normalized, normalized)


def _assistant_json_action_arguments(payload: Dict[str, Any], tool_name: str) -> Dict[str, Any]:
    raw_arguments = payload.get("arguments")
    if raw_arguments is None:
        raw_arguments = payload.get("args")
    if isinstance(raw_arguments, dict):
        arguments: Dict[str, Any] = dict(raw_arguments)
    elif raw_arguments is not None:
        arguments = {"input": raw_arguments}
    else:
        arguments = {}

    if tool_name == "shell__exec":
        command = (
            arguments.get("command")
            or payload.get("command")
            or payload.get("cmd")
            or payload.get("input")
        )
        if command:
            arguments["command"] = str(command)
    for key in ("description", "reason", "target"):
        value = payload.get(key)
        if value is not None and key not in arguments:
            arguments[key] = value
    return arguments


def _assistant_json_action_tool_calls(payload: Any, available_tool_names: set[str]) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        tool_calls: List[Dict[str, Any]] = []
        for item in payload:
            tool_calls.extend(_assistant_json_action_tool_calls(item, available_tool_names))
        return tool_calls
    if not isinstance(payload, dict):
        return []

    nested_actions = payload.get("actions")
    if nested_actions is None:
        nested_actions = payload.get("tool_calls")
    if isinstance(nested_actions, list):
        return _assistant_json_action_tool_calls(nested_actions, available_tool_names)

    raw_tool_name = (
        payload.get("tool")
        or payload.get("tool_name")
        or payload.get("name")
        or payload.get("action")
        or payload.get("capability")
    )
    tool_name = _normalize_assistant_json_tool_name(raw_tool_name)
    if not tool_name or tool_name not in available_tool_names:
        return []
    arguments = _assistant_json_action_arguments(payload, tool_name)
    if (
        tool_name == "shell__exec"
        and "computer__system_info" in available_tool_names
        and _looks_like_system_info_shell_command(arguments.get("command"))
    ):
        return [{"name": "computer__system_info", "arguments": {}}]
    if tool_name == "shell__exec" and not arguments.get("command"):
        return []
    return [{"name": tool_name, "arguments": arguments}]


def _try_parse_assistant_json_action_block(value: str, available_tool_names: set[str]) -> List[Dict[str, Any]]:
    text = str(value or "").strip()
    if not text:
        return []
    try:
        payload = json.loads(text)
    except Exception:
        return []
    return _assistant_json_action_tool_calls(payload, available_tool_names)


def _extract_assistant_json_action_tool_calls_from_text(
    value: Any,
    tools: List[Dict[str, Any]],
) -> tuple[str, List[Dict[str, Any]]]:
    raw = str(value or "")
    if not raw:
        return raw, []
    available_tool_names = _assistant_plan_tool_names(tools)
    if not available_tool_names:
        return raw, []

    tool_calls: List[Dict[str, Any]] = []
    removals: List[tuple[int, int]] = []
    for match in _ASSISTANT_JSON_FENCE_RE.finditer(raw):
        calls = _try_parse_assistant_json_action_block(match.group(1), available_tool_names)
        if not calls:
            continue
        tool_calls.extend(calls)
        removals.append((match.start(), match.end()))

    cleaned = raw
    if removals:
        parts: List[str] = []
        cursor = 0
        for start, end in removals:
            parts.append(raw[cursor:start])
            cursor = end
        parts.append(raw[cursor:])
        cleaned = "".join(parts).strip()

    stripped = cleaned.strip()
    if not tool_calls and stripped.startswith(("{", "[")) and stripped.endswith(("}", "]")):
        calls = _try_parse_assistant_json_action_block(stripped, available_tool_names)
        if calls:
            return "", calls

    return cleaned, tool_calls


def _has_shell_exec_tool(tools: List[Dict[str, Any]]) -> bool:
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    return "shell__exec" in tool_names


def _has_tool(tools: List[Dict[str, Any]], tool_name: str) -> bool:
    expected = str(tool_name or "").strip()
    return bool(expected) and expected in {
        str(item.get("name") or "").strip()
        for item in tools
        if isinstance(item, dict)
    }


def _normalize_assistant_shell_line(raw_line: Any) -> str:
    line = str(raw_line or "").strip()
    line = line.strip("`").strip()
    line = re.sub(r"^(?:bash|sh|zsh)\s+(?!-)", "", line, count=1, flags=re.I).strip()
    if line.startswith("$ "):
        line = line[2:].strip()
    return line


def _looks_like_assistant_shell_line(line: str) -> bool:
    value = str(line or "").strip()
    if not value or value in {"```", "```bash", "```sh", "```shell", "```zsh"}:
        return False
    if len(value) > 1500:
        return False
    if _ASSISTANT_SHELL_LINE_RE.search(value):
        return True
    return bool(_ASSISTANT_SHELL_LINE_HINT_RE.search(value))


def _extract_assistant_shell_command_blocks(text: str) -> List[str]:
    command_blocks: List[str] = []
    for match in _ASSISTANT_SHELL_PLAN_RE.finditer(text):
        block = str(match.group(1) or "").strip()
        if not block:
            continue
        lines = []
        for raw_line in block.splitlines():
            line = _normalize_assistant_shell_line(raw_line)
            if line:
                lines.append(line)
        if lines:
            command_blocks.append("\n".join(lines))
    if command_blocks:
        return command_blocks

    for match in _ASSISTANT_INLINE_SHELL_PLAN_RE.finditer(text):
        line = _normalize_assistant_shell_line(match.group(1))
        if _looks_like_assistant_shell_line(line):
            command_blocks.append(line)
    if command_blocks:
        return command_blocks

    current_block: List[str] = []
    for raw_line in text.splitlines():
        line = _normalize_assistant_shell_line(raw_line)
        labeled_command_match = _ASSISTANT_LABELED_SHELL_COMMAND_RE.match(line)
        if labeled_command_match:
            labeled_command = _normalize_assistant_shell_line(labeled_command_match.group("command"))
            if labeled_command:
                current_block.append(labeled_command)
            continue
        if _looks_like_assistant_shell_line(line):
            current_block.append(line)
            continue
        if current_block:
            command_blocks.append("\n".join(current_block))
            current_block = []
    if current_block:
        command_blocks.append("\n".join(current_block))
    return command_blocks


def _looks_like_system_info_shell_command(command: Any) -> bool:
    normalized = " ".join(str(command or "").strip().lower().split())
    if not normalized:
        return False
    system_info_prefixes = (
        "systeminfo",
        "system_profiler",
        "sw_vers",
        "uname",
        "sysctl",
        "wmic",
        "cat /etc/os-release",
    )
    return any(normalized == prefix or normalized.startswith(f"{prefix} ") for prefix in system_info_prefixes)


def _extract_assistant_shell_plan_tool_call(
    reply: Any,
    tools: List[Dict[str, Any]],
) -> tuple[str, List[Dict[str, Any]]]:
    text = str(reply or "").strip()
    if not text:
        return "", []
    has_shell_exec_tool = _has_shell_exec_tool(tools)
    has_computer_system_info_tool = _has_tool(tools, "computer__system_info")
    if not has_shell_exec_tool and not has_computer_system_info_tool:
        return text, []
    normalized = " ".join(text.lower().split())
    if not any(marker in normalized for marker in _ASSISTANT_SHELL_PLAN_MARKERS):
        return text, []
    command_blocks = _extract_assistant_shell_command_blocks(text)
    command = "\n\n".join(command_blocks).strip()
    if not command or len(command) > 5000:
        return text, []
    if has_computer_system_info_tool and _looks_like_system_info_shell_command(command):
        return "", [{"name": "computer__system_info", "arguments": {}}]
    if not has_shell_exec_tool:
        return text, []
    return "", [
        {
            "name": "shell__exec",
            "arguments": {
                "command": command,
                "description": "Run the local checks Sage prepared.",
            },
        }
    ]


def _trace_raw_event(envelope: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(envelope, dict):
        return None
    return {
        "type": "trace",
        "payload": envelope,
    }


def _fallback_trace_raw_event(
    *,
    event_type: str,
    data: Optional[Dict[str, Any]],
    tool_call_id: Optional[str] = None,
    item_id: Optional[str] = None,
    artifact_id: Optional[str] = None,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    if artifact_id:
        metadata["artifact_id"] = artifact_id
    return {
        "type": "trace",
        "payload": {
            "event_type": event_type,
            "persisted": False,
            "tool_call_id": tool_call_id,
            "item_id": item_id,
            "artifact_id": artifact_id,
            "metadata": metadata,
            "data": dict(data or {}),
        },
    }


def _emit_trace_event(
    trace_context: Optional[Any],
    *,
    event_type: str,
    data: Optional[Dict[str, Any]],
    persisted: bool,
    parent_id: Optional[str] = None,
    item_id: Optional[str] = None,
    tool_call_id: Optional[str] = None,
    child_run_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    artifact_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if trace_context is None:
        return None
    if persisted:
        envelope = run_async_tool_call(
            agent_trace_service.emit_with_envelope(
                trace_context,
                event_type,
                data,
                persisted=True,
                parent_id=parent_id,
                item_id=item_id,
                tool_call_id=tool_call_id,
                child_run_id=child_run_id,
                approval_id=approval_id,
                artifact_id=artifact_id,
            )
        )
    else:
        envelope = agent_trace_service.build_ephemeral_envelope(
            trace_context,
            event_type,
            data,
            parent_id=parent_id,
            item_id=item_id,
            tool_call_id=tool_call_id,
            child_run_id=child_run_id,
            approval_id=approval_id,
            artifact_id=artifact_id,
        )
    return _trace_raw_event(envelope)


def _finish_trace(trace_context: Optional[Any], *, outcome: str, final_message_id: Optional[str]) -> None:
    if trace_context is None:
        return
    run_async_tool_call(
        agent_trace_service.finish_trace(
            trace_context,
            outcome=outcome,
            final_message_id=final_message_id,
        )
    )


def _public_generation_error_code(llm_error: str) -> str:
    detail = str(llm_error or "").strip()
    if detail.startswith("max_tool_iterations_reached:"):
        return detail
    if detail.startswith("provider_"):
        return detail
    lowered = detail.lower()
    if "http_429" in lowered or "rate limit" in lowered or "too many requests" in lowered:
        return "provider_rate_limited"
    if "direct_chat_transport_unavailable" in lowered:
        return "provider_transport_unavailable"
    return "provider_generation_failed" if detail else "unknown_error"


def _public_generation_error_reply(services: DirectChatGenerationServices, llm_error: str) -> str:
    reply = str(services.direct_chat_error_reply(llm_error) or "").strip()
    lower_reply = reply.lower()
    if (
        reply
        and not lower_reply.startswith("chat failed:")
        and "incompleteread" not in lower_reply
        and "incomplete read" not in lower_reply
        and "connection reset" not in lower_reply
        and "remote end closed" not in lower_reply
    ):
        return reply
    return "The selected AI provider hit a temporary generation error. Try again in a moment."


def _turn_metadata_from_session(session_ctx: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(session_ctx, dict):
        return {}
    metadata: Dict[str, Any] = {}
    turn_request = session_ctx.get("agent_turn_request")
    if hasattr(turn_request, "context_hints") and isinstance(turn_request.context_hints, dict):
        raw_metadata = turn_request.context_hints.get("metadata")
        if isinstance(raw_metadata, dict):
            metadata.update(raw_metadata)
    raw_metadata = session_ctx.get("metadata")
    if isinstance(raw_metadata, dict):
        metadata.update(raw_metadata)
    return metadata


def _provider_alias(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "openai-codex":
        return "codex_cli"
    return normalized


def _provider_mismatch(requested_provider: Any, actual_provider: Any) -> bool:
    requested = _provider_alias(requested_provider)
    actual = _provider_alias(actual_provider)
    return bool(requested and actual and requested != actual)


def _model_alias(value: Any) -> str:
    return str(value or "").strip().lower()


def _model_mismatch(expected_model: Any, actual_model: Any) -> bool:
    expected = _model_alias(expected_model)
    actual = _model_alias(actual_model)
    return bool(expected and actual and expected != actual)


def _platform_paid_ai_identity(
    *,
    availability_payload: Dict[str, Any],
    metadata: Dict[str, Any],
    session_ctx: Optional[Dict[str, Any]],
    requested_provider: str,
    requested_model: str,
    effective_provider: Optional[str],
    effective_model: Optional[str],
) -> Optional[Dict[str, str]]:
    turn_metadata = {
        **_turn_metadata_from_session(session_ctx),
        **(metadata if isinstance(metadata, dict) else {}),
    }
    billing_source = str(
        availability_payload.get("billing_source")
        or turn_metadata.get("billing_source")
        or ""
    ).strip().lower()
    credential_plane = str(availability_payload.get("credential_plane") or "").strip().lower()
    public_tier = str(turn_metadata.get("ai_tier") or "").strip().lower().replace("-", "_")
    if public_tier not in empyralis_model_tier_contract.EMPYRALIS_HOSTED_TIERS:
        public_tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
            requested_provider=requested_provider or effective_provider,
            requested_model=requested_model or effective_model,
            metadata={
                **turn_metadata,
                **({"billing_source": billing_source} if billing_source else {}),
                **({"credential_plane": credential_plane} if credential_plane else {}),
            },
        ) or ""
    if (
        credential_plane != "platform_runtime"
        and billing_source != "empyralis_credits"
        and public_tier not in empyralis_model_tier_contract.EMPYRALIS_HOSTED_TIERS
    ):
        return None
    tier = empyralis_model_tier_contract.normalize_model_tier(public_tier or "pro", fallback="pro")
    label = empyralis_model_tier_contract.model_tier_contract(tier).public_label
    return {
        "ai_tier": tier,
        "ai_label": f"{label} AI",
        "billing_source": "empyralis_credits",
    }


def _mask_platform_paid_final_payload(payload: Dict[str, Any], identity: Optional[Dict[str, str]]) -> Dict[str, Any]:
    if not identity:
        return payload
    ai_label = str(identity.get("ai_label") or "Empyralis AI").strip() or "Empyralis AI"

    def _sanitize_public_string(value: str) -> str:
        sanitized = str(value)
        replacements = [
            (r"deepseek-v4-flash", "Light AI"),
            (r"deepseek-v4-pro", "Pro AI"),
            (r"deepseek", ai_label),
        ]
        for pattern, replacement in replacements:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
        return sanitized

    def _sanitize_public_value(value: Any) -> Any:
        if isinstance(value, dict):
            return {str(key): _sanitize_public_value(item) for key, item in value.items()}
        if isinstance(value, list):
            return [_sanitize_public_value(item) for item in value]
        if isinstance(value, str):
            return _sanitize_public_string(value)
        return value

    def _strip_internal_route(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                str(key): _strip_internal_route(item)
                for key, item in value.items()
                if str(key) not in {
                    "provider",
                    "model",
                    "requested_provider",
                    "requested_model",
                    "effective_provider",
                    "effective_model",
                    "attempted_providers",
                    "internal_provider",
                    "internal_model",
                    "pricing_source",
                }
            }
        if isinstance(value, list):
            return [_strip_internal_route(item) for item in value]
        return value

    masked = dict(payload)
    masked["provider"] = None
    masked["model"] = None
    masked["attempted_providers"] = None
    masked["usage_masked"] = _strip_internal_route(masked.get("usage_masked"))
    masked["billing_source"] = identity["billing_source"]
    masked["ai_tier"] = identity["ai_tier"]
    masked["ai_label"] = identity["ai_label"]
    context_used = masked.get("context_used")
    if isinstance(context_used, dict):
        masked["context_used"] = {
            **context_used,
            "requested_provider": None,
            "effective_provider": None,
            "requested_model": None,
            "effective_model": None,
            "provider_overridden": False,
            "model_overridden": False,
            "billing_source": identity["billing_source"],
            "ai_tier": identity["ai_tier"],
            "ai_label": identity["ai_label"],
        }
    return _sanitize_public_value(masked)


def stream_provider_backed_direct_chat(
    *,
    services: DirectChatGenerationServices,
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    system_prompt: Optional[str],
    normalized_workspace_id: str,
    normalized_requested_provider: str,
    normalized_requested_model: str,
    normalized_reasoning_effort: Optional[str],
    normalized_thread_id: str,
    normalized_message: str,
    compacted_prior_messages: List[Dict[str, Any]],
    prior_messages_used: bool,
    history_mode: str,
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    availability_payload: Dict[str, Any],
    tools: List[Dict[str, Any]],
    direct_chat_credentials: Dict[str, Any],
    proactive_suggestions: List[str],
    tool_loop_session_key: str,
    fallback_reason: Optional[str],
    session_ctx: Optional[Dict[str, Any]],
    trace_context: Optional[Any],
    resolved_chat_max_iterations: int,
    direct_tool_result_summary_system_message: str,
    assistant_plan_tools: Optional[List[Dict[str, Any]]] = None,
) -> Iterator[Dict[str, Any]]:
    usage_masked: Dict[str, Any] = {}
    attempted_providers = ""
    llm_error = ""
    actual_provider: Optional[str] = str(metadata.get("provider") or "").strip() or None
    actual_model: Optional[str] = str(metadata.get("model") or "").strip() or None
    
    # Reasoning effort logic
    if normalized_reasoning_effort:
        supports_reasoning = False
        if actual_model:
            model_lower = actual_model.lower()
            supports_reasoning = (
                model_lower.startswith("o1")
                or model_lower.startswith("o3")
                or "deepseek-r1" in model_lower
                or "deepseek-reasoner" in model_lower
                or ("gemini" in model_lower and "thinking" in model_lower)
            )
        
        if not supports_reasoning:
            # Model does not support reasoning effort natively, pass as system prompt instruction
            system_instruction = f"The user has requested a {normalized_reasoning_effort} reasoning effort. Please adjust the depth of your thinking and response accordingly."
            system_prompt = f"{system_prompt}\n\n[System Instruction: {system_instruction}]" if system_prompt else f"[System Instruction: {system_instruction}]"
            normalized_reasoning_effort = None

    if availability_payload.get("selected_model_unavailable") is True:
        unavailable_tier = str(availability_payload.get("selected_model_unavailable_tier") or "").strip()
        unavailable_model = str(availability_payload.get("selected_model_unavailable_model") or normalized_requested_model or "").strip()
        unavailable_reason = str(availability_payload.get("selected_model_unavailable_reason") or "").strip()
        if unavailable_reason == "unknown_provider_for_selected_model" and unavailable_model:
            error_detail = (
                f"The selected model '{unavailable_model}' is not mapped to a provider. "
                "Choose a mapped model/provider in AI setup."
            )
        else:
            error_detail = "Selected model is unavailable. Choose another model or add the required key."
        yield {
            "type": "final",
            "payload": {
                "reply": "",
                "actions": [],
                "interventions": [
                    build_intervention(
                        "selected_model_unavailable",
                        "Selected model unavailable",
                        detail=error_detail,
                        severity="warning",
                        status="failed",
                        code="selected_model_unavailable",
                    )
                ],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "usage_masked": {},
                "provider": actual_provider,
                "model": actual_model,
                "attempted_providers": "",
                "error": "selected_model_unavailable",
                "context_used": services.build_context_used(
                    workspace_id=normalized_workspace_id,
                    requested_provider=normalized_requested_provider,
                    effective_provider=None,
                    requested_model=normalized_requested_model,
                    effective_model=None,
                    reasoning_effort=normalized_reasoning_effort,
                    connected_systems=connected_systems,
                    tool_capabilities=tool_capabilities,
                    prior_messages_used=prior_messages_used,
                    history_mode=history_mode,
                    run_created=False,
                    fallback_used=False,
                    fallback_reason=unavailable_tier or fallback_reason,
                ),
            },
        }
        return

    executed_any_tools = False
    conversation_messages: List[Dict[str, Any]] = []
    direct_tool_authoritative_messages: List[str] = []
    direct_tool_authoritative_results: List[Dict[str, str]] = []
    direct_tool_artifact_ids: List[str] = []
    conversation_messages.extend(compacted_prior_messages)
    current_prompt = normalized_message
    max_iterations = resolved_chat_max_iterations
    trace_started_at = time.monotonic()

    registry = get_global_hook_registry()
    hook_ctx = registry.execute(
        HOOK_AGENT_START,
        HookContext(
            hook_point=HOOK_AGENT_START,
            workspace_id=normalized_workspace_id,
            session_id=normalized_thread_id,
            channel=str(metadata.get("channel", "")),
            messages=list(conversation_messages),
            system_prompt=system_prompt or "",
            tools=list(tools),
        ),
    )
    if hook_ctx.aborted:
        abort_detail = str(hook_ctx.abort_reason or "").strip() or "Agent start was stopped before the model turn began."
        yield {
            "reply": "",
            "interventions": [
                build_intervention(
                    "system_error",
                    "Agent start blocked",
                    detail=abort_detail,
                    severity="error",
                    status="failed",
                    code="agent_start_aborted",
                )
            ],
            "aborted": True,
            "error": "agent_start_aborted",
        }
        return

    trace_plan_id = uuid.uuid4().hex
    planning_item_id = uuid.uuid4().hex
    assistant_message_id = uuid.uuid4().hex
    health_safety_context = healthguide_safety_service.resolve_health_safety_context(session_ctx=session_ctx)
    effective_assistant_plan_tools = assistant_plan_tools if assistant_plan_tools is not None else tools
    buffer_assistant_tool_plans = False
    trace_started_raw = _emit_trace_event(
        trace_context,
        event_type="trace.started",
        data={"input_mode": "text"},
        persisted=True,
    )
    if trace_started_raw is not None:
        yield trace_started_raw
    trace_plan_started = _emit_trace_event(
        trace_context,
        event_type="plan.started",
        data={
            "plan_id": trace_plan_id,
            "title": "Sage Plan",
            "summary": "Review the request, decide whether tools are needed, and produce the final answer.",
        },
        persisted=True,
    )
    if trace_plan_started is not None:
        yield trace_plan_started
    trace_plan_item = _emit_trace_event(
        trace_context,
        event_type="plan.item.created",
        data={
            "plan_id": trace_plan_id,
            "item_id": planning_item_id,
            "index": 1,
            "title": "Review the request and choose the next action",
            "kind": "respond",
            "owner": "sage",
            "depends_on": [],
            "rationale_summary": "Start by planning the response before deciding whether a tool call is necessary.",
        },
        persisted=True,
        item_id=planning_item_id,
    )
    if trace_plan_item is not None:
        yield trace_plan_item
    trace_plan_item_running = _emit_trace_event(
        trace_context,
        event_type="plan.item.updated",
        data={
            "item_id": planning_item_id,
            "status": "running",
            "summary": "Planning the response.",
        },
        persisted=True,
        item_id=planning_item_id,
    )
    if trace_plan_item_running is not None:
        yield trace_plan_item_running
    reasoning_started = _emit_trace_event(
        trace_context,
        event_type="reasoning.summary.delta",
        data={"delta": "Planning the response."},
        persisted=False,
        item_id=planning_item_id,
    )
    if reasoning_started is not None:
        yield reasoning_started

    for iteration in range(max_iterations):
        thinking_iteration = iteration + 1
        yield services.thinking_step_payload(thinking_iteration, "active")

        iteration_reply = ""
        iteration_tool_calls: List[Dict[str, Any]] = []
        iteration_failed = False
        suppress_unverified_action_chunks = False
        pending_stream_text = ""
        stream_released = False

        messages = conversation_messages or []
        for event in services.generate_chat_reply_stream_with_provider_fallback(
            context=context,
            metadata=metadata,
            message=current_prompt,
            user_goal=current_prompt,
            system_prompt=system_prompt,
            prior_messages=messages or None,
        ):
            event_type = str(event.get("type") or "").strip().lower()
            if event_type == "chunk":
                delta = response_leak_guard_service.guard_stream_delta(event.get("delta") or "")
                if delta:
                    iteration_reply += delta
                    contains_assistant_tool_markup = (
                        _looks_like_dsml_tool_markup(delta)
                        or _looks_like_dsml_tool_markup(iteration_reply)
                        or _looks_like_assistant_json_action_markup(delta)
                        or _looks_like_assistant_json_action_markup(iteration_reply)
                        or _looks_like_assistant_shell_plan_markup(delta)
                        or _looks_like_assistant_shell_plan_markup(iteration_reply)
                    )
                    if not executed_any_tools and _contains_unverified_external_action_claim(iteration_reply):
                        suppress_unverified_action_chunks = True
                    if not buffer_assistant_tool_plans and not contains_assistant_tool_markup and not suppress_unverified_action_chunks:
                        if not stream_released:
                            pending_stream_text += delta
                            if _looks_like_assistant_action_plan_preamble(pending_stream_text):
                                pending_stream_text = ""
                                suppress_unverified_action_chunks = True
                                continue
                            should_release_stream = (
                                len(pending_stream_text) >= 96
                                or bool(re.search(r"[.!?]\s*$", pending_stream_text))
                                or "\n" in pending_stream_text
                            )
                            if not should_release_stream:
                                continue
                            delta = pending_stream_text
                            pending_stream_text = ""
                            stream_released = True
                        yield {"type": "chunk", "delta": delta}
                        trace_delta = _emit_trace_event(
                            trace_context,
                            event_type="assistant.message.delta",
                            data={
                                "message_id": assistant_message_id,
                                "delta": delta,
                            },
                            persisted=False,
                        )
                        if trace_delta is not None:
                            yield trace_delta
                continue
            if event_type == "result":
                final_reply = str(event.get("reply") or "").strip() or iteration_reply
                usage_masked = event.get("usage_masked") if isinstance(event.get("usage_masked"), dict) else {}
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                actual_provider = str(event.get("provider") or actual_provider or "").strip() or actual_provider
                expected_model_lock = str(actual_model or metadata.get("model") or normalized_requested_model or "").strip()
                actual_model = str(event.get("model") or actual_model or "").strip() or actual_model
                requested_provider_lock = str(normalized_requested_provider or metadata.get("requested_provider") or "").strip()
                if _provider_mismatch(requested_provider_lock, actual_provider):
                    mismatch_detail = "The selected AI provider did not match the provider that returned the response, so the turn was stopped."
                    yield services.thinking_step_payload(
                        thinking_iteration,
                        "error",
                        "Selected provider mismatch",
                    )
                    trace_failed = _emit_trace_event(
                        trace_context,
                        event_type="trace.failed",
                        data={
                            "code": "provider_mismatch",
                            "message": mismatch_detail,
                            "retryable": False,
                            "failed_item_id": planning_item_id,
                        },
                        persisted=True,
                        item_id=planning_item_id,
                    )
                    if trace_failed is not None:
                        yield trace_failed
                    _finish_trace(trace_context, outcome="partial", final_message_id=None)
                    yield {
                        "type": "final",
                        "payload": {
                            "reply": "",
                            "actions": [],
                            "interventions": [
                                build_intervention(
                                    "provider_mismatch",
                                    "Selected model provider mismatch",
                                    detail=mismatch_detail,
                                    severity="error",
                                    status="failed",
                                    code="provider_mismatch",
                                )
                            ],
                            "suggestions": proactive_suggestions,
                            "mode": "answer",
                            "usage_masked": usage_masked,
                            "provider": actual_provider,
                            "model": actual_model,
                            "attempted_providers": attempted_providers,
                            "error": "provider_mismatch",
                            "context_used": services.build_context_used(
                                workspace_id=normalized_workspace_id,
                                requested_provider=normalized_requested_provider,
                                effective_provider=str(actual_provider or "").strip() or None,
                                requested_model=normalized_requested_model,
                                effective_model=str(actual_model or "").strip() or None,
                                reasoning_effort=normalized_reasoning_effort,
                                connected_systems=connected_systems,
                                tool_capabilities=tool_capabilities,
                                prior_messages_used=prior_messages_used,
                                history_mode=history_mode,
                                run_created=False,
                                fallback_used=False,
                                fallback_reason="provider_mismatch",
                            ),
                        },
                    }
                    return
                if _model_mismatch(expected_model_lock, actual_model):
                    mismatch_detail = "The selected AI model did not match the model that returned the response, so the turn was stopped."
                    yield services.thinking_step_payload(
                        thinking_iteration,
                        "error",
                        "Selected model mismatch",
                    )
                    trace_failed = _emit_trace_event(
                        trace_context,
                        event_type="trace.failed",
                        data={
                            "code": "model_mismatch",
                            "message": mismatch_detail,
                            "retryable": False,
                            "failed_item_id": planning_item_id,
                        },
                        persisted=True,
                        item_id=planning_item_id,
                    )
                    if trace_failed is not None:
                        yield trace_failed
                    _finish_trace(trace_context, outcome="partial", final_message_id=None)
                    yield {
                        "type": "final",
                        "payload": {
                            "reply": "",
                            "actions": [],
                            "interventions": [
                                build_intervention(
                                    "model_mismatch",
                                    "Selected model mismatch",
                                    detail=mismatch_detail,
                                    severity="error",
                                    status="failed",
                                    code="model_mismatch",
                                )
                            ],
                            "suggestions": proactive_suggestions,
                            "mode": "answer",
                            "usage_masked": usage_masked,
                            "provider": actual_provider,
                            "model": actual_model,
                            "attempted_providers": attempted_providers,
                            "error": "model_mismatch",
                            "context_used": services.build_context_used(
                                workspace_id=normalized_workspace_id,
                                requested_provider=normalized_requested_provider,
                                effective_provider=str(actual_provider or "").strip() or None,
                                requested_model=normalized_requested_model,
                                effective_model=str(actual_model or "").strip() or None,
                                reasoning_effort=normalized_reasoning_effort,
                                connected_systems=connected_systems,
                                tool_capabilities=tool_capabilities,
                                prior_messages_used=prior_messages_used,
                                history_mode=history_mode,
                                run_created=False,
                                fallback_used=False,
                                fallback_reason="model_mismatch",
                            ),
                        },
                    }
                    return
                iteration_tool_calls = event.get("tool_calls") if isinstance(event.get("tool_calls"), list) else []
                final_reply, dsml_tool_calls = _extract_dsml_tool_calls_from_text(final_reply)
                if dsml_tool_calls:
                    iteration_tool_calls = [*iteration_tool_calls, *dsml_tool_calls]
                final_reply, json_action_tool_calls = _extract_assistant_json_action_tool_calls_from_text(
                    final_reply,
                    effective_assistant_plan_tools,
                )
                if json_action_tool_calls:
                    iteration_tool_calls = [*iteration_tool_calls, *json_action_tool_calls]
                if not iteration_tool_calls:
                    final_reply, assistant_shell_plan_tool_calls = _extract_assistant_shell_plan_tool_call(
                        final_reply,
                        effective_assistant_plan_tools,
                    )
                    if assistant_shell_plan_tool_calls:
                        iteration_tool_calls = assistant_shell_plan_tool_calls
                if not iteration_tool_calls:
                    final_reply = _strip_assistant_pseudo_tool_lines(final_reply)
                    if not executed_any_tools and _looks_like_assistant_action_plan_preamble(final_reply):
                        final_reply = ""
                yield services.thinking_step_payload(
                    thinking_iteration,
                    "done",
                    "Prepared the next action" if iteration_tool_calls else "Answer ready",
                )

                if current_prompt:
                    conversation_messages.append({"role": "user", "content": current_prompt})
                effective_iteration_provider = str(actual_provider or context.get("provider") or "").strip().lower()
                if final_reply or iteration_tool_calls:
                    assistant_message: Dict[str, Any] = {"role": "assistant"}
                    if final_reply:
                        assistant_message["content"] = final_reply
                    if iteration_tool_calls and effective_iteration_provider != "codex_cli":
                        assistant_message["tool_calls"] = iteration_tool_calls
                    if assistant_message.get("content") or assistant_message.get("tool_calls"):
                        conversation_messages.append(assistant_message)

                if iteration_tool_calls:
                    plan_done = _emit_trace_event(
                        trace_context,
                        event_type="plan.item.updated",
                        data={
                            "item_id": planning_item_id,
                            "status": "done",
                            "summary": "Tool calls are required before answering.",
                        },
                        persisted=True,
                        item_id=planning_item_id,
                    )
                    if plan_done is not None:
                        yield plan_done
                    loop_detected = any(
                        services.record_direct_tool_signature(tool_loop_session_key, tool_call)
                        for tool_call in iteration_tool_calls
                        if isinstance(tool_call, dict)
                    )
                    if loop_detected:
                        trace_failed = _emit_trace_event(
                            trace_context,
                            event_type="trace.failed",
                            data={
                                "code": "tool_loop_detected",
                                "message": "The same direct tool action repeated and execution was halted.",
                                "retryable": False,
                                "failed_item_id": planning_item_id,
                            },
                            persisted=True,
                            item_id=planning_item_id,
                        )
                        if trace_failed is not None:
                            yield trace_failed
                        _finish_trace(trace_context, outcome="partial", final_message_id=None)
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": "",
                                "actions": [],
                                "interventions": [
                                    build_intervention(
                                        "loop_detected",
                                        "Stopped repeated tool loop",
                                        detail="The same tool action kept repeating, so direct execution was halted. Start a durable run to continue end-to-end.",
                                        severity="warning",
                                        status="failed",
                                        code="tool_loop_detected",
                                    )
                                ],
                                "suggestions": proactive_suggestions,
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "tool_loop_detected",
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        services.clear_direct_tool_loop_state(tool_loop_session_key)
                        return
                    approval_payload = services.build_direct_tool_approval_response(
                        tool_calls=iteration_tool_calls,
                        tool_capabilities=tool_capabilities,
                        session_ctx={**(session_ctx or {}), "user_message": normalized_message},
                    )
                    if approval_payload is not None:
                        approval_blocked = _emit_trace_event(
                            trace_context,
                            event_type="plan.item.updated",
                            data={
                                "item_id": planning_item_id,
                                "status": "blocked",
                                "summary": "Waiting for approval before running direct tools.",
                            },
                            persisted=True,
                            item_id=planning_item_id,
                        )
                        if approval_blocked is not None:
                            yield approval_blocked
                        trace_completed = _emit_trace_event(
                            trace_context,
                            event_type="trace.completed",
                            data={
                                "duration_ms": int((time.monotonic() - trace_started_at) * 1000),
                                "final_message_id": None,
                            },
                            persisted=True,
                        )
                        if trace_completed is not None:
                            yield trace_completed
                        _finish_trace(trace_context, outcome="needs_input", final_message_id=None)
                        yield {
                            "type": "final",
                            "payload": {
                                **approval_payload,
                                "suggestions": proactive_suggestions,
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "",
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                    try:
                        connector_id = ""
                        action_id = ""
                        argument_payload: Dict[str, Any] = {}
                        step_id = f"tool:{thinking_iteration}:0"
                        for tool_index, tool_call in enumerate(iteration_tool_calls, start=1):
                            connector_id, action_id = services.parse_tool_name(str(tool_call.get("name") or ""))
                            argument_payload = services.tool_arguments_payload(tool_call.get("arguments"))
                            if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
                                nested_input = services.parse_page_state(str(argument_payload.get("input") or ""))
                                if isinstance(nested_input, dict):
                                    argument_payload = nested_input
                            step_id = f"tool:{thinking_iteration}:{tool_index}"
                            tool_item_id = uuid.uuid4().hex
                            tool_call_id = str(tool_call.get("id") or "").strip() or f"toolcall_{uuid.uuid4().hex}"
                            if isinstance(tool_call, dict) and not str(tool_call.get("id") or "").strip():
                                tool_call["id"] = tool_call_id
                            tool_name = str(tool_call.get("name") or f"{connector_id}__{action_id}").strip()
                            tool_display_label = _direct_tool_user_facing_label(tool_name, connector_id, action_id)
                            tool_trace_metadata = direct_tool_execution_service.build_direct_tool_trace_metadata(
                                connector_id,
                                action_id,
                                argument_payload,
                            )
                            tool_plan_item = _emit_trace_event(
                                trace_context,
                                event_type="plan.item.created",
                                data={
                                    "plan_id": trace_plan_id,
                                    "item_id": tool_item_id,
                                    "index": tool_index + 1,
                                    "title": f"Use {tool_display_label}",
                                    "kind": "tool",
                                    "owner": "sage",
                                    "depends_on": [planning_item_id],
                                    "rationale_summary": "A direct tool call is needed to complete the request.",
                                },
                                persisted=True,
                                item_id=tool_item_id,
                            )
                            if tool_plan_item is not None:
                                yield tool_plan_item
                            tool_plan_running = _emit_trace_event(
                                trace_context,
                                event_type="plan.item.updated",
                                data={
                                    "item_id": tool_item_id,
                                    "status": "running",
                                    "summary": f"Using {tool_display_label}.",
                                },
                                persisted=True,
                                item_id=tool_item_id,
                            )
                            if tool_plan_running is not None:
                                yield tool_plan_running
                            tool_started = _emit_trace_event(
                                trace_context,
                                event_type="tool.started",
                                data={
                                    "tool_name": tool_name,
                                    "capability_id": tool_trace_metadata.get("capability_id"),
                                    "connector_id": connector_id or None,
                                    "args_preview": secret_redaction_service.sanitize_mapping(argument_payload),
                                },
                                persisted=True,
                                item_id=tool_item_id,
                                tool_call_id=tool_call_id,
                            )
                            if tool_started is not None:
                                yield tool_started
                            tool_progress = _emit_trace_event(
                                trace_context,
                                event_type="tool.progress",
                                data={
                                    "message": f"Using {tool_display_label}",
                                    "percent": 0,
                                },
                                persisted=False,
                                tool_call_id=tool_call_id,
                            )
                            if tool_progress is not None:
                                yield tool_progress
                            if str(tool_trace_metadata.get("search_query") or "").strip():
                                trace_search_query = _emit_trace_event(
                                    trace_context,
                                    event_type="search.query",
                                    data={
                                        "provider": connector_id or "web",
                                        "query": str(tool_trace_metadata.get("search_query") or "").strip(),
                                        "filters": {},
                                    },
                                    persisted=True,
                                    tool_call_id=tool_call_id,
                                )
                                if trace_search_query is not None:
                                    yield trace_search_query
                            if isinstance(tool_trace_metadata.get("browser_action"), dict):
                                browser_action_payload = dict(tool_trace_metadata.get("browser_action") or {})
                                trace_browser_action = _emit_trace_event(
                                    trace_context,
                                    event_type="browser.action",
                                    data={
                                        "action": str(browser_action_payload.get("action") or action_id or "").strip(),
                                        "target_summary": str(browser_action_payload.get("target_summary") or "").strip(),
                                        "url": browser_action_payload.get("url"),
                                    },
                                    persisted=True,
                                    tool_call_id=tool_call_id,
                                )
                                if trace_browser_action is not None:
                                    yield trace_browser_action
                            yield services.direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="active",
                            )
                            tool_result = services.execute_single_direct_tool_call(
                                tool_call=tool_call,
                                workspace_id=normalized_workspace_id,
                                thread_id=normalized_thread_id,
                                index=tool_index,
                                provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                model=str(actual_model or "").strip() or None,
                                credentials=direct_chat_credentials if isinstance(direct_chat_credentials, dict) else None,
                                reasoning_effort=normalized_reasoning_effort or "",
                                session_ctx=session_ctx,
                            )
                            executed_any_tools = True
                            completed_trace_metadata = direct_tool_execution_service.build_direct_tool_trace_metadata(
                                connector_id,
                                action_id,
                                argument_payload,
                                result_text=tool_result,
                            )
                            completed_screenshot_payload = completed_trace_metadata.get("browser_screenshot")
                            if isinstance(completed_screenshot_payload, dict):
                                completed_artifact_id = str(completed_screenshot_payload.get("artifact_id") or "").strip()
                                if completed_artifact_id and completed_artifact_id not in direct_tool_artifact_ids:
                                    direct_tool_artifact_ids.append(completed_artifact_id)
                            if isinstance(completed_trace_metadata.get("search_results"), list) and completed_trace_metadata.get("search_results"):
                                trace_search_results = _emit_trace_event(
                                    trace_context,
                                    event_type="search.results",
                                    data={"results": list(completed_trace_metadata.get("search_results") or [])},
                                    persisted=True,
                                    tool_call_id=tool_call_id,
                                )
                                if trace_search_results is not None:
                                    yield trace_search_results
                            if isinstance(completed_trace_metadata.get("browser_screenshot"), dict):
                                browser_screenshot_payload = dict(completed_trace_metadata.get("browser_screenshot") or {})
                                browser_screenshot_data = {
                                    "caption": str(browser_screenshot_payload.get("caption") or "").strip(),
                                    "width": int(browser_screenshot_payload.get("width") or 0),
                                    "height": int(browser_screenshot_payload.get("height") or 0),
                                }
                                browser_screenshot_artifact_id = str(browser_screenshot_payload.get("artifact_id") or "").strip() or None
                                trace_browser_screenshot = _emit_trace_event(
                                    trace_context,
                                    event_type="browser.screenshot",
                                    data=browser_screenshot_data,
                                    persisted=True,
                                    tool_call_id=tool_call_id,
                                    artifact_id=browser_screenshot_artifact_id,
                                )
                                if trace_browser_screenshot is not None:
                                    yield trace_browser_screenshot
                                else:
                                    yield _fallback_trace_raw_event(
                                        event_type="browser.screenshot",
                                        data=browser_screenshot_data,
                                        tool_call_id=tool_call_id,
                                        artifact_id=browser_screenshot_artifact_id,
                                    )
                            tool_result_event = _emit_trace_event(
                                trace_context,
                                event_type="tool.result",
                                data={
                                    "status": "ok",
                                    "tool_name": tool_name,
                                    "capability_id": completed_trace_metadata.get("capability_id") or tool_trace_metadata.get("capability_id"),
                                    "connector_id": connector_id or None,
                                    "action_id": action_id or None,
                                    "summary": str(completed_trace_metadata.get("result_summary") or tool_result or "").strip(),
                                    "artifact_ids": (
                                        [str((completed_trace_metadata.get("browser_screenshot") or {}).get("artifact_id") or "").strip()]
                                        if isinstance(completed_trace_metadata.get("browser_screenshot"), dict)
                                        and str((completed_trace_metadata.get("browser_screenshot") or {}).get("artifact_id") or "").strip()
                                        else []
                                    ),
                                },
                                persisted=True,
                                tool_call_id=tool_call_id,
                            )
                            if tool_result_event is not None:
                                yield tool_result_event
                            tool_plan_done = _emit_trace_event(
                                trace_context,
                                event_type="plan.item.updated",
                                data={
                                    "item_id": tool_item_id,
                                    "status": "done",
                                    "summary": f"Completed {tool_display_label}.",
                                },
                                persisted=True,
                                item_id=tool_item_id,
                            )
                            if tool_plan_done is not None:
                                yield tool_plan_done
                            yield services.direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="done",
                            )
                            authoritative_result_message = _direct_tool_authoritative_result_message(
                                tool_name=str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                result_text=tool_result,
                                trace_metadata=completed_trace_metadata,
                            )
                            direct_tool_authoritative_messages.append(authoritative_result_message)
                            direct_tool_authoritative_results.append(
                                _direct_tool_result_record(
                                    tool_name=str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                    result_text=tool_result,
                                    trace_metadata=completed_trace_metadata,
                                )
                            )
                            if effective_iteration_provider == "codex_cli":
                                conversation_messages.append(
                                    {
                                        "role": "user",
                                        "content": services.direct_tool_followup_message(
                                            str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                            tool_result,
                                        ),
                                    }
                                )
                            else:
                                conversation_messages.append(
                                    {
                                        "role": "tool",
                                        "tool_call_id": tool_call_id,
                                        "name": str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                        "content": tool_result,
                                    }
                                )
                                conversation_messages.append(
                                    {
                                        "role": "system",
                                        "content": authoritative_result_message,
                                    }
                                )
                        if effective_iteration_provider == "codex_cli":
                            conversation_messages.append({"role": "system", "content": direct_tool_result_summary_system_message})
                            current_prompt = (
                                "Continue until the task is complete. If another tool is needed, call it now. "
                                "Otherwise provide the final answer to the user."
                            )
                        else:
                            current_prompt = (
                                "\n\n".join(direct_tool_authoritative_messages[-8:])
                                + "\n\nUse the authoritative action outcomes above to answer the user. "
                                "If the user's request is now complete, answer the user. If another tool is needed, call it now."
                            )
                        break
                    except Exception as exc:
                        llm_error = str(exc).strip() or "connector_action_failed"
                        services.capture_exception(exc)
                        tool_call_for_error = locals().get("tool_call")
                        if isinstance(tool_call_for_error, dict):
                            tool_name_for_error = str(
                                tool_call_for_error.get("name")
                                or f"{connector_id}__{action_id}"
                            ).strip()
                        else:
                            tool_name_for_error = str(f"{connector_id}__{action_id}").strip()
                        tool_name_for_error = tool_name_for_error if tool_name_for_error != "__" else "direct_tool"
                        tool_item_id_for_error = str(locals().get("tool_item_id") or planning_item_id).strip()
                        tool_failure = _emit_trace_event(
                            trace_context,
                            event_type="tool.result",
                            data={
                                "status": "error",
                                "tool_name": tool_name_for_error,
                                "connector_id": connector_id or None,
                                "action_id": action_id or None,
                                "summary": llm_error,
                                "artifact_ids": [],
                            },
                            persisted=True,
                            tool_call_id=f"toolcall_error:{thinking_iteration}",
                        )
                        if tool_failure is not None:
                            yield tool_failure
                        tool_plan_failed = _emit_trace_event(
                            trace_context,
                            event_type="plan.item.updated",
                            data={
                                "item_id": tool_item_id_for_error,
                                "status": "failed",
                                "summary": f"{tool_name_for_error} failed.",
                            },
                            persisted=True,
                            item_id=tool_item_id_for_error,
                        )
                        if tool_plan_failed is not None:
                            yield tool_plan_failed
                        yield services.direct_tool_step_payload(
                            connector_id,
                            action_id,
                            argument_payload,
                            step_id=step_id,
                            status="error",
                            detail_override=llm_error,
                        )
                        if effective_iteration_provider != "codex_cli":
                            conversation_messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tool_call_id,
                                    "name": tool_name_for_error,
                                    "content": (
                                        f"Tool execution failed: {llm_error}. "
                                        "Use only the provided tools and choose another tool if needed."
                                    ),
                                }
                            )
                            current_prompt = ""
                            break
                        trace_failed = _emit_trace_event(
                            trace_context,
                            event_type="trace.failed",
                            data={
                                "code": llm_error,
                                "message": llm_error,
                                "retryable": False,
                                "failed_item_id": planning_item_id,
                            },
                            persisted=True,
                            item_id=planning_item_id,
                        )
                        if trace_failed is not None:
                            yield trace_failed
                        _finish_trace(trace_context, outcome="partial", final_message_id=None)
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": "",
                                "actions": [],
                                "interventions": [
                                    build_intervention(
                                        "system_error",
                                        "Direct tool action failed",
                                        detail=llm_error,
                                        severity="error",
                                        status="failed",
                                        code=llm_error,
                                    )
                                ],
                                "suggestions": proactive_suggestions,
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": llm_error,
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                actions = [] if executed_any_tools else services.suggest_actions(normalized_message, availability_payload)
                citation_refs: List[str] = []
                if health_safety_context.get("enabled"):
                    safety_result = healthguide_safety_service.apply_health_safety_to_reply(
                        reply=final_reply,
                        user_message=normalized_message,
                        assistant_name=str(health_safety_context.get("assistant_name") or "").strip() or None,
                        response_payload=event,
                    )
                    final_reply = str(safety_result.get("reply") or final_reply).strip()
                    citation_refs = list(safety_result.get("citation_refs") or [])
                    if (
                        conversation_messages
                        and isinstance(conversation_messages[-1], dict)
                        and str(conversation_messages[-1].get("role") or "").strip() == "assistant"
                    ):
                        conversation_messages[-1] = {
                            **conversation_messages[-1],
                            "content": final_reply,
                        }
                leak_guard = response_leak_guard_service.guard_model_response(final_reply)
                final_reply = leak_guard.text
                if not final_reply.strip():
                    public_error_code = "assistant_response_suppressed"
                    public_error_detail = (
                        "The selected model returned internal action text instead of a user-facing answer, "
                        "so the response was not shown as Sage speech."
                    )
                    trace_failed = _emit_trace_event(
                        trace_context,
                        event_type="trace.failed",
                        data={
                            "code": public_error_code,
                            "message": public_error_detail,
                            "retryable": True,
                            "failed_item_id": planning_item_id,
                        },
                        persisted=True,
                        item_id=planning_item_id,
                    )
                    if trace_failed is not None:
                        yield trace_failed
                    _finish_trace(trace_context, outcome="partial", final_message_id=None)
                    yield {
                        "type": "final",
                        "payload": {
                            "reply": "",
                            "actions": [],
                            "interventions": [
                                build_intervention(
                                    "system_error",
                                    "Assistant response suppressed",
                                    detail=public_error_detail,
                                    severity="warning",
                                    status="failed",
                                    code=public_error_code,
                                )
                            ],
                            "suggestions": proactive_suggestions,
                            "mode": "answer",
                            "usage_masked": usage_masked,
                            "provider": actual_provider,
                            "model": actual_model,
                            "attempted_providers": attempted_providers,
                            "error": public_error_code,
                            "response_leak_guard": leak_guard.metadata(),
                            "context_used": services.build_context_used(
                                workspace_id=normalized_workspace_id,
                                requested_provider=normalized_requested_provider,
                                effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                requested_model=normalized_requested_model,
                                effective_model=str(actual_model or "").strip() or None,
                                reasoning_effort=normalized_reasoning_effort,
                                connected_systems=connected_systems,
                                tool_capabilities=tool_capabilities,
                                prior_messages_used=prior_messages_used,
                                history_mode=history_mode,
                                run_created=False,
                                fallback_used=False,
                                fallback_reason=public_error_code,
                            ),
                        },
                    }
                    services.clear_direct_tool_loop_state(tool_loop_session_key)
                    return
                if (
                    conversation_messages
                    and isinstance(conversation_messages[-1], dict)
                    and str(conversation_messages[-1].get("role") or "").strip() == "assistant"
                ):
                    conversation_messages[-1] = {
                        **conversation_messages[-1],
                        "content": final_reply,
                    }
                trace_plan_answer_done = _emit_trace_event(
                    trace_context,
                    event_type="plan.item.updated",
                    data={
                        "item_id": planning_item_id,
                        "status": "done",
                        "summary": "Final answer is ready.",
                    },
                    persisted=True,
                    item_id=planning_item_id,
                )
                if trace_plan_answer_done is not None:
                    yield trace_plan_answer_done
                trace_message_completed = _emit_trace_event(
                    trace_context,
                    event_type="assistant.message.completed",
                    data={
                        "message_id": assistant_message_id,
                        "text": final_reply,
                        "citation_refs": citation_refs,
                        "artifact_ids": list(direct_tool_artifact_ids),
                    },
                    persisted=True,
                )
                if trace_message_completed is not None:
                    yield trace_message_completed
                trace_completed = _emit_trace_event(
                    trace_context,
                    event_type="trace.completed",
                    data={
                        "duration_ms": int((time.monotonic() - trace_started_at) * 1000),
                        "final_message_id": assistant_message_id,
                    },
                    persisted=True,
                )
                if trace_completed is not None:
                    yield trace_completed
                _finish_trace(trace_context, outcome="success", final_message_id=assistant_message_id)
                effective_provider = str(actual_provider or context.get("provider") or "").strip() or None
                effective_model = str(actual_model or "").strip() or None
                platform_paid_identity = _platform_paid_ai_identity(
                    availability_payload=availability_payload,
                    metadata=metadata,
                    session_ctx=session_ctx,
                    requested_provider=normalized_requested_provider,
                    requested_model=normalized_requested_model,
                    effective_provider=effective_provider,
                    effective_model=effective_model,
                )
                final_response_payload = {
                    "reply": final_reply,
                    "actions": actions,
                    "suggestions": proactive_suggestions,
                    "mode": "answer_with_action" if actions else "answer",
                    "usage_masked": usage_masked,
                    "provider": actual_provider,
                    "model": actual_model,
                    "attempted_providers": attempted_providers,
                    "error": llm_error,
                    "metadata": {
                        "artifact_ids": list(direct_tool_artifact_ids),
                        "artifacts": [
                            {
                                "artifact_id": artifact_id,
                                "label": "Agent Computer screenshot",
                                "kind": "screenshot",
                            }
                            for artifact_id in direct_tool_artifact_ids
                        ],
                    } if direct_tool_artifact_ids else {},
                    "response_leak_guard": leak_guard.metadata(),
                    "context_used": services.build_context_used(
                        workspace_id=normalized_workspace_id,
                        requested_provider=normalized_requested_provider,
                        effective_provider=effective_provider,
                        requested_model=normalized_requested_model,
                        effective_model=effective_model,
                        reasoning_effort=normalized_reasoning_effort,
                        connected_systems=connected_systems,
                        tool_capabilities=tool_capabilities,
                        prior_messages_used=prior_messages_used,
                        history_mode=history_mode,
                        run_created=False,
                        fallback_used=False,
                        fallback_reason=fallback_reason,
                    ),
                }
                final_payload = {
                    "type": "final",
                    "payload": _mask_platform_paid_final_payload(final_response_payload, platform_paid_identity),
                }

                registry = get_global_hook_registry()
                registry.execute(
                    HOOK_AGENT_END,
                    HookContext(
                        hook_point=HOOK_AGENT_END,
                        workspace_id=normalized_workspace_id,
                        session_id=normalized_thread_id,
                        channel=str(metadata.get("channel", "")),
                        reply=final_reply,
                        usage=usage_masked,
                        metadata={"provider": actual_provider, "model": actual_model},
                    ),
                )

                yield final_payload
                should_persist_final_reply = not is_public_generation_error_message(final_reply)
                if should_persist_final_reply:
                    services.persist_direct_chat_memory_best_effort(
                        workspace_id=normalized_workspace_id,
                        provider=effective_provider,
                        model=effective_model,
                        credentials=direct_chat_credentials,
                        reasoning_effort=normalized_reasoning_effort,
                        prior_messages=compacted_prior_messages,
                        user_message=normalized_message,
                        assistant_reply=final_reply,
                    )
                    services.persist_direct_chat_transcript_best_effort(
                        workspace_id=normalized_workspace_id,
                        thread_id=normalized_thread_id,
                        provider=effective_provider,
                        model=effective_model,
                        messages=conversation_messages,
                        user_message=normalized_message,
                        assistant_reply=final_reply,
                    )
                services.persist_direct_chat_hosted_usage_best_effort(
                    workspace_id=normalized_workspace_id,
                    thread_id=normalized_thread_id,
                    session_ctx=session_ctx,
                    availability_payload=availability_payload,
                    usage_masked=usage_masked,
                    requested_provider=normalized_requested_provider,
                    effective_provider=effective_provider,
                    requested_model=normalized_requested_model,
                    effective_model=effective_model,
                )
                services.clear_direct_tool_loop_state(tool_loop_session_key)
                return
            if event_type == "failure":
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                public_error_reply = _public_generation_error_reply(services, llm_error)
                public_error_code = _public_generation_error_code(llm_error)
                trace_plan_failure = _emit_trace_event(
                    trace_context,
                    event_type="plan.item.updated",
                    data={
                        "item_id": planning_item_id,
                        "status": "failed",
                        "summary": public_error_reply,
                    },
                    persisted=True,
                    item_id=planning_item_id,
                )
                if trace_plan_failure is not None:
                    yield trace_plan_failure
                yield services.thinking_step_payload(thinking_iteration, "error", public_error_reply)
                llm_error = public_error_code
                iteration_failed = True
                break

        if iteration_failed:
            break
        if not iteration_tool_calls:
            break
    else:
        llm_error = llm_error or f"max_tool_iterations_reached:{max_iterations}"

    actions = [] if executed_any_tools else services.suggest_actions(normalized_message, availability_payload)
    services.clear_direct_tool_loop_state(tool_loop_session_key)
    public_error_reply = _public_generation_error_reply(services, llm_error)
    public_error_code = _public_generation_error_code(llm_error)
    effective_provider = str(actual_provider or context.get("provider") or "").strip() or None
    effective_model = str(actual_model or "").strip() or None
    trace_failed = _emit_trace_event(
        trace_context,
        event_type="trace.failed",
        data={
            "code": public_error_code,
            "message": public_error_reply,
            "retryable": False,
            "failed_item_id": planning_item_id,
        },
        persisted=True,
        item_id=planning_item_id,
    )
    if trace_failed is not None:
        yield trace_failed
    _finish_trace(trace_context, outcome="partial", final_message_id=None)
    platform_paid_identity = _platform_paid_ai_identity(
        availability_payload=availability_payload,
        metadata=metadata,
        session_ctx=session_ctx,
        requested_provider=normalized_requested_provider,
        requested_model=normalized_requested_model,
        effective_provider=effective_provider,
        effective_model=effective_model,
    )
    final_error_payload = {
        "reply": "",
        "actions": actions,
        "interventions": [
            build_intervention(
                "model_response_failed",
                "Sage response unavailable",
                detail=public_error_reply,
                severity="error",
                status="failed",
                code=public_error_code,
            )
        ],
        "suggestions": proactive_suggestions,
        "mode": "answer_with_action" if actions else "answer",
        "usage_masked": usage_masked,
        "provider": actual_provider,
        "model": actual_model,
        "attempted_providers": attempted_providers,
        "error": public_error_code,
        "context_used": services.build_context_used(
            workspace_id=normalized_workspace_id,
            requested_provider=normalized_requested_provider,
            effective_provider=effective_provider,
            requested_model=normalized_requested_model,
            effective_model=effective_model,
            reasoning_effort=normalized_reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            prior_messages_used=prior_messages_used,
            history_mode=history_mode,
            run_created=False,
            fallback_used=False,
            fallback_reason=fallback_reason,
        ),
    }
    yield {
        "type": "final",
        "payload": _mask_platform_paid_final_payload(final_error_payload, platform_paid_identity),
    }
